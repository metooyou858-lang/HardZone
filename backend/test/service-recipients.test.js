process.env.NODE_ENV = 'test';
process.env.HARDZONE_SESSION_SECRET = 'recipient-test-secret';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const aqsi = require('../src/services/aqsi');
let refunds = 0;
aqsi.sendRefundToAqsi = async () => { refunds++; return { id: 'mock-refund' }; };
const app = require('../src/app');
const { pool } = require('../src/db');
const { confirmOpenOrderPayment } = require('../src/services/order-sync');
let server;
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('service recipients: defaults, independent grants, repeat confirmation, refunds, edit locks and validation', async () => {
  assert.ok(process.env.DATABASE_URL?.includes('recipient'), 'Run only against an isolated recipient test database');
  const { rows: [admin] } = await pool.query("SELECT id, name, username, role FROM users WHERE role = 'admin' AND is_active LIMIT 1");
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 600000, user: { ...admin, id: Number(admin.id) } })).toString('base64url');
  const token = payload + '.' + createHmac('sha256', process.env.HARDZONE_SESSION_SECRET).update(payload).digest('base64url');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  async function request(path, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/orders${path}`, {
      method, headers: { 'content-type': 'application/json', 'x-hardzone-session': token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const { rows: people } = await pool.query("INSERT INTO clients(first_name,last_name) VALUES ('Получатель А','Тест'),('Получатель Б','Тест') RETURNING id");
  const { rows: [product] } = await pool.query("SELECT p.id, p.name, sp.visits_total FROM products p JOIN product_subscription_params sp ON sp.product_id=p.id WHERE sp.subscription_type='visits' AND sp.visits_total > 0 LIMIT 1");
  assert.ok(product);
  const { rows: [order] } = await pool.query("INSERT INTO orders(client_id,items_count,total_amount,comment) VALUES ($1,2,200,'recipient-isolated-test') RETURNING *", [people[0].id]);
  const { rows: items } = await pool.query("INSERT INTO order_items(order_id,kind,product_id,name,sale_price,quantity) VALUES ($1,'subscription',$2,$3,100,1),($1,'subscription',$2,$3,100,1) RETURNING *", [order.id,product.id,product.name]);
  const patch = (id, recipient) => request(`/${order.id}/items/${id}`, 'PATCH', { recipient_client_id: recipient });
  assert.equal((await patch(items[1].id, 'nonsense')).status, 422);
  assert.equal((await patch(items[1].id, '999999999')).status, 404);
  assert.equal((await patch(items[1].id, people[1].id)).status, 200);
  const detail = await request(`/${order.id}`);
  assert.match(detail.body.data.items.find((item) => item.id === items[1].id).recipient_name, /Получатель Б/);
  await pool.query("UPDATE orders SET aqsi_payment_status='starting' WHERE id=$1", [order.id]);
  assert.equal((await patch(items[1].id, people[0].id)).status, 409);
  await pool.query('UPDATE orders SET aqsi_payment_status=NULL WHERE id=$1', [order.id]);
  await confirmOpenOrderPayment(order.id, 'card');
  await confirmOpenOrderPayment(order.id, 'card');
  const { rows: grants } = await pool.query('SELECT * FROM client_subscriptions WHERE order_id=$1', [order.id]);
  assert.equal(grants.length, 2);
  for (let index = 0; index < 2; index++) {
    const grant = grants.find((item) => item.order_item_id === items[index].id);
    assert.equal(grant.client_id, people[index].id);
    assert.equal(grant.visits_left, product.visits_total);
    assert.equal(grant.status, 'active');
  }
  assert.equal((await patch(items[1].id, people[0].id)).status, 409);
  await pool.query("UPDATE orders SET fiscal_fd='1',fiscal_fn='1',fiscal_fp='1',fiscal_kkt_reg='1',fiscal_date=NOW() WHERE id=$1", [order.id]);
  const refund = await request(`/${order.id}/refund`, 'POST', { items: [{ item_id: items[1].id, quantity: 1 }] });
  assert.equal(refund.status, 200, JSON.stringify(refund.body));
  assert.equal(refunds, 1);
  const { rows: afterRefund } = await pool.query('SELECT * FROM client_subscriptions WHERE order_id=$1', [order.id]);
  assert.equal(afterRefund.find((item) => item.order_item_id === items[0].id).visits_left, product.visits_total);
  assert.equal(afterRefund.find((item) => item.order_item_id === items[0].id).status, 'active');
  assert.equal(afterRefund.find((item) => item.order_item_id === items[1].id).visits_left, 0);

  // All recipients may be selected per line without a customer on the receipt.
  const { rows: [secondOrder] } = await pool.query("INSERT INTO orders(items_count,total_amount) VALUES (2,200) RETURNING *");
  await pool.query("INSERT INTO order_items(order_id,kind,product_id,name,sale_price,quantity,recipient_client_id) VALUES ($1,'subscription',$2,$3,100,1,$4),($1,'subscription',$2,$3,100,1,$4)", [secondOrder.id,product.id,product.name,people[1].id]);
  await confirmOpenOrderPayment(secondOrder.id, 'cash');
  const { rows: siblings } = await pool.query('SELECT * FROM client_subscriptions WHERE order_id=$1', [secondOrder.id]);
  assert.equal(siblings.length, 2);
  assert.ok(siblings.every((item) => item.status === 'active' && item.client_id === people[1].id));
  const { rows: [unassigned] } = await pool.query("INSERT INTO orders(items_count,total_amount) VALUES (1,100) RETURNING *");
  await pool.query("INSERT INTO order_items(order_id,kind,product_id,name,sale_price,quantity) VALUES ($1,'subscription',$2,$3,100,1)", [unassigned.id,product.id,product.name]);
  assert.equal((await request(`/${unassigned.id}/initiate-payment`, 'POST', {})).status, 422);
  assert.equal((await request(`/${unassigned.id}/send-to-aqsi`, 'POST', {})).status, 422);
  const analytics = await fetch(`http://127.0.0.1:${server.address().port}/api/analytics`, { headers: { 'x-hardzone-session': token } });
  assert.equal(analytics.status, 200, await analytics.text());
});

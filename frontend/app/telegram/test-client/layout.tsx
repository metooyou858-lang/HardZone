import "@fontsource/oswald/cyrillic-600.css";
import "@fontsource/oswald/cyrillic-700.css";
import "./test-client.css";

export default function TestClientLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="hz-test-client">{children}</div>;
}

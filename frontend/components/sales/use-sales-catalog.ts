"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import {
  buildCatalogGroups,
  type BannerState,
  type CatalogGroup,
  isSellableInCash,
  SERVICES_GROUP_ID,
} from "@/components/sales/sales-shared";
import { fetchCategories } from "@/lib/api/categories";
import { fetchProducts, searchProducts, type Product } from "@/lib/api/products";

type UseSalesCatalogOptions = {
  enabled: boolean;
  setBanner: Dispatch<SetStateAction<BannerState>>;
};

export function useSalesCatalog({ enabled, setBanner }: UseSalesCatalogOptions) {
  const [query, setQuery] = useState("");
  const [catalogGroups, setCatalogGroups] = useState<CatalogGroup[]>([]);
  const [catalogGroupsLoading, setCatalogGroupsLoading] = useState(true);
  const [selectedCatalogGroup, setSelectedCatalogGroup] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  function reloadCatalog() {
    setReloadToken((value) => value + 1);
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function loadCatalogGroups() {
      setCatalogGroupsLoading(true);

      try {
        const [categories, services] = await Promise.all([
          fetchCategories(),
          fetchProducts({ forSale: true, type: "service" }),
        ]);

        if (!cancelled) {
          setCatalogGroups(buildCatalogGroups(categories, services.filter(isSellableInCash).length));
        }
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            text: error instanceof Error ? error.message : "Не удалось загрузить категории продаж",
          });
        }
      } finally {
        if (!cancelled) {
          setCatalogGroupsLoading(false);
        }
      }
    }

    void loadCatalogGroups();

    return () => {
      cancelled = true;
    };
  }, [enabled, reloadToken, setBanner]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    const trimmedQuery = query.trim();

    const timer = window.setTimeout(async () => {
      setCatalogLoading(true);

      try {
        let nextProducts: Product[] = [];

        if (trimmedQuery.length >= 2) {
          nextProducts = await searchProducts(trimmedQuery);
        } else if (selectedCatalogGroup === SERVICES_GROUP_ID) {
          nextProducts = await fetchProducts({ forSale: true, type: "service" });
        } else if (selectedCatalogGroup) {
          nextProducts = await fetchProducts({ forSale: true, categoryId: selectedCatalogGroup });
        }

        if (!cancelled) {
          setCatalog(nextProducts.filter(isSellableInCash));
        }
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            text: error instanceof Error ? error.message : "Не удалось загрузить каталог",
          });
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, query, reloadToken, selectedCatalogGroup, setBanner]);

  return {
    query,
    setQuery,
    catalogGroups,
    catalogGroupsLoading,
    selectedCatalogGroup,
    setSelectedCatalogGroup,
    catalog,
    catalogLoading,
    reloadCatalog,
  };
}

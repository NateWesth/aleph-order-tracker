
import { useOrderFetch } from "./useOrderFetch";
import { useOrderUpdates } from "./useOrderUpdates";

export * from "./useOrders";

export function useOrderData() {
  const fetchHook = useOrderFetch();
  const updateHook = useOrderUpdates();
  
  return {
    ...fetchHook,
    ...updateHook
  };
}

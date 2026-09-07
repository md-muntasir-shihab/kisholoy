import { useTranslation } from "react-i18next"

import { useOrders } from "../../../hooks/api/orders"
import { usePermissions } from "../../../providers/permissions-provider"
import type { NavItemBadge } from "../nav-item"

/**
 * Live counters rendered as badges in the main sidebar.
 *
 * Every counter is derived from a real API response - never hard-coded - and
 * every request is gated on the corresponding read permission so a user who
 * cannot read the resource does not trigger a 403 on every page load.
 */
export const useNavBadges = () => {
  const { t } = useTranslation()
  const { can } = usePermissions()

  const canReadOrders = can("order", "read")

  /**
   * We only need the total count, so ask for a single row and the cheapest
   * possible field selection. `count` in the list response is the number of
   * matching orders, not the number of returned rows.
   */
  const { count: pendingOrderCount } = useOrders(
    {
      status: ["pending"],
      limit: 1,
      fields: "id",
    },
    {
      enabled: canReadOrders,
      // The sidebar is always mounted; avoid a request storm on navigation
      // while still keeping the number reasonably fresh.
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )

  const orders: NavItemBadge | undefined =
    canReadOrders && !!pendingOrderCount
      ? {
          label: t("app.nav.badges.pending", { count: pendingOrderCount }),
          srLabel: t("app.nav.badges.pendingSr", { count: pendingOrderCount }),
          color: "orange",
        }
      : undefined

  return { orders }
}

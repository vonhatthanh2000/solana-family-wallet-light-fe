import { useEffect, useState } from "react";
import { spaceActionApi } from "../actions/space-action-api";
import type { SpaceDashboard } from "../contracts";
import { ActivityPanel } from "./ActivityPanel";
import { useSpaceActivity } from "./useSpaceActivity";

type Props = { dashboard: SpaceDashboard; enabled: boolean };

export function SpaceActivitySection({ dashboard, enabled }: Props) {
  const spaceId = dashboard.space.spaceId;
  const flow = useSpaceActivity({ spaceId, enabled });
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);

  // Only the history filter needs the category list, so a failed lookup must not hide the feed.
  useEffect(() => {
    let active = true;
    setCategories([]);
    if (!enabled || !spaceId) return;
    spaceActionApi.listCategories(spaceId)
      .then((rows) => { if (active) setCategories(rows.filter((row) => !row.isOthers)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [enabled, spaceId]);

  return <ActivityPanel flow={flow} vaults={dashboard.vaults} categories={categories} />;
}

import { CopyButton } from "../components/CopyButton";
import type { SolanaMemberFlow } from "./useSolanaMemberFlow";

type Props = { flow: SolanaMemberFlow };

function permissionLabel(permission: string): string {
  return permission.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

export function MemberWorkspaceCard({ flow }: Props) {
  if (!flow.space) return null;
  const space = flow.space;
  return (
    <section className="space-information" aria-labelledby="member-workspace-title">
      <div className="space-summary">
        <div>
          <span className="eyebrow">Accepted member workspace</span>
          <h3 id="member-workspace-title">{space.name}</h3>
          <p>{space.purpose} Space · {space.memberCount} active members</p>
        </div>
        <span className="status status-done">{space.membershipStatus}</span>
      </div>
      <dl className="compact-details">
        <div><dt>Space ID</dt><dd className="mono wrap"><span className="copyable">{space.spaceId}<CopyButton value={space.spaceId} label="Space ID" /></span></dd></div>
        <div><dt>Your role</dt><dd>{space.role}</dd></div>
        <div><dt>Member change</dt><dd>{space.memberChangeInProgress ? "In progress" : "None"}</dd></div>
      </dl>
      <div className="permission-block">
        <strong>Permissions in this Space</strong>
        {flow.role ? (
          <>
            <div className="permission-list">
              {flow.role.permissions.map((permission) => (
                <span className="permission-chip" key={permission}>{permissionLabel(permission)}</span>
              ))}
            </div>
            <small className="muted">
              {flow.role.countsInQuorum ? "Can vote" : "Does not vote"}
              {" · "}
              {flow.role.onChainSigner ? "On-chain signer" : "No on-chain signing role"}
            </small>
          </>
        ) : (
          <p className="muted">The backend did not return a definition for role {space.role}.</p>
        )}
      </div>
      <div className="space-chains">
        {space.chains.map((chain) => (
          <div key={chain.chainObjectId}>
            <strong>{chain.chainType} {chain.chainId}</strong>
            <span>{chain.isDeployed ? "Deployed" : chain.status ?? "Not deployed"}</span>
            <span className="copyable"><code>{chain.address ?? "No deposit address"}</code><CopyButton value={chain.address} label="deposit address" /></span>
          </div>
        ))}
      </div>
    </section>
  );
}

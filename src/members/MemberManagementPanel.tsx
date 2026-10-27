import type { SolanaMemberFlow } from "./useSolanaMemberFlow";
import { CopyButton } from "../components/CopyButton";
import {
  memberDisplayName,
  requestActionLabel,
  sendActionLabel,
  shortId,
} from "./member-view";

type Props = {
  flow: SolanaMemberFlow;
  spaceId: string;
};

function copy(value: string) {
  void navigator.clipboard?.writeText(value);
}

function permissionLabel(permission: string): string {
  return permission.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}

export function MemberManagementPanel({ flow, spaceId }: Props) {
  const me = flow.members.find((member) => member.userId === flow.actorUserId);
  const settledRole = me?.role ?? flow.space?.role;
  const owner = settledRole === "OWNER";
  const canInvite = flow.can("INVITE");
  const canProposeMemberChange = flow.can("PROPOSE_MEMBER_CHANGE");
  const canTransferOwnership = flow.can("TRANSFER_OWNERSHIP");
  const busy = Boolean(flow.busyAction);

  return (
    <section className="member-demo">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Three-profile backend test</p>
          <h2>Member management</h2>
        </div>
        <button className="secondary" onClick={() => void flow.refresh()} disabled={flow.refreshing}>
          {flow.refreshing ? "Refreshing…" : "Refresh requests"}
        </button>
      </div>

      <div className="member-session">
        <div><span>Current user</span><strong className="mono">{shortId(flow.actorUserId)}</strong></div>
        <div><span>Settled role</span><strong>{settledRole ?? "Not loaded"}</strong></div>
        <div><span>Space</span><strong className="mono">{spaceId ? shortId(spaceId) : "Not selected"}</strong></div>
      </div>

      {flow.space && (
        <div className="space-information">
          <div className="space-summary">
            <div>
              <span className="eyebrow">Accepted member workspace</span>
              <h3>{flow.space.name}</h3>
              <p>{flow.space.purpose} Space · {flow.space.memberCount} active members</p>
            </div>
            <span className="status status-done">{flow.space.membershipStatus}</span>
          </div>
          <dl className="compact-details">
            <div><dt>Space ID</dt><dd className="mono wrap"><span className="copyable">{flow.space.spaceId}<CopyButton value={flow.space.spaceId} label="Space ID" /></span></dd></div>
            <div><dt>Your role</dt><dd>{flow.space.role}</dd></div>
            <div><dt>Member change</dt><dd>{flow.space.memberChangeInProgress ? "In progress" : "None"}</dd></div>
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
              <p className="muted">The backend did not return a definition for role {flow.space.role}.</p>
            )}
          </div>
          <div className="space-chains">
            {flow.space.chains.map((chain) => (
              <div key={chain.chainObjectId}>
                <strong>{chain.chainType} {chain.chainId}</strong>
                <span>{chain.isDeployed ? "Deployed" : chain.status ?? "Not deployed"}</span>
                <span className="copyable"><code>{chain.address ?? "No deposit address"}</code><CopyButton value={chain.address} label="deposit address" /></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {flow.error && (
        <div className="inline-error" role="alert">
          <strong>Member flow error</strong>
          {flow.error.status && <span> · HTTP {flow.error.status}</span>}
          {flow.error.code && <span> · {flow.error.code}</span>}
          <p>{flow.error.message}</p>
          <button className="secondary" onClick={flow.clearError}>Dismiss</button>
        </div>
      )}

      <div className="member-columns">
        {(!flow.space || canInvite) && <div className="member-subpanel">
          <h3>Invite a member</h3>
          <p>Create a MEMBER invite in the Owner profile, then paste its code in another profile.</p>
          <button onClick={() => void flow.createInvite()} disabled={!spaceId || busy}>
            {flow.busyAction === "create-invite" ? "Checking…" : "Create or reuse member invite"}
          </button>
          {flow.createdInvite && (
            <div className="result-box">
              <strong>{flow.inviteReused ? "Existing open MEMBER invite" : "New MEMBER invite"}</strong>
              <span className="copyable"><code>{flow.createdInvite.code}</code><CopyButton value={flow.createdInvite.code} label="invite code" /></span>
              <span>Status: {flow.createdInvite.status}</span>
              <span>Expires: {new Date(flow.createdInvite.expiresAt).toLocaleString()}</span>
              <div className="button-row"><button className="secondary" onClick={() => copy(flow.createdInvite!.code)}>Copy code</button><button className="danger" onClick={() => void flow.revokeInvite()} disabled={busy}>Revoke invite</button></div>
            </div>
          )}
          <label>
            Invite code
            <input
              value={flow.inviteCode}
              onChange={(event) => flow.setInviteCode(event.target.value)}
              placeholder="Paste code in Member B or C profile"
            />
          </label>
          <div className="button-row">
            <button className="secondary" onClick={() => void flow.previewInvite()} disabled={!flow.inviteCode.trim() || busy}>
              Preview invite
            </button>
            <button onClick={() => void flow.joinInvite()} disabled={!flow.inviteCode.trim() || busy}>
              Ask to join
            </button>
          </div>
          {flow.invitePreview && (
            <div className="result-box">
              <strong>{flow.invitePreview.name}</strong>
              <span>Join as {flow.invitePreview.role} · {flow.invitePreview.memberCount} members</span>
              <span>Status: {flow.invitePreview.status}</span>
            </div>
          )}
          {flow.joinResult && (
            <div className="result-box success-box">
              <strong>Join request created</strong>
              <span className="mono copyable">{flow.joinResult.requestId}<CopyButton value={flow.joinResult.requestId} label="request ID" /></span>
              <span>Status: {flow.joinResult.status}. An eligible member must approve it.</span>
            </div>
          )}
        </div>}

        <div className="member-subpanel approval-inbox">
          <h3>Requests to approve</h3>
          <p>This inbox refreshes automatically only while a request or chain action is active.</p>
          {!spaceId && <p className="muted">Create, import, or preview a Space first.</p>}
          {spaceId && !flow.requests.length && <p className="muted">No visible requests.</p>}
          {flow.requests.map((request) => {
            const label = requestActionLabel(request);
            const canApprove = flow.canApprove(request);
            const canDecline = flow.canDecline(request);
            const alreadyApproved = Boolean(
              flow.actorUserId && request.seals.includes(flow.actorUserId),
            );
            return (
              <article className="request-card" key={request.id}>
                <div className="request-title">
                  <strong className="action-label">{label}</strong>
                  <span className={`status status-${request.status.toLowerCase()}`}>{request.status}</span>
                </div>
                <dl className="compact-details">
                  <div><dt>Request</dt><dd className="mono">{shortId(request.id)}</dd></div>
                  <div><dt>Approval</dt><dd>{request.seals.length} / {request.need} seals</dd></div>
                  <div><dt>Target</dt><dd className="mono">{shortId(request.targetUserId)}</dd></div>
                </dl>
                <div className="button-row">
                  <button onClick={() => void flow.approve(request)} disabled={!canApprove || busy}>
                    {flow.busyAction === `approve:${request.id}` ? "Approving…" : `Approve: ${label}`}
                  </button>
                  {canDecline && <button className="danger" onClick={() => void flow.decline(request)} disabled={busy}>{flow.busyAction === `decline:${request.id}` ? "Declining…" : "Decline"}</button>}
                  {request.proposerUserId === flow.actorUserId && request.status === "PENDING" && /VAULT|MONEY|RULE/.test(request.kind) && <button className="secondary" onClick={() => void flow.cancelRequest(request)} disabled={busy}>Withdraw</button>}
                  {request.status === "APPROVED" && /VAULT|MONEY/.test(request.kind) && <button className="secondary" onClick={() => void flow.applyVaultRequest(request)} disabled={busy}>Retry apply</button>}
                </div>
                {!canApprove && (
                  <small className="muted">
                    {alreadyApproved
                      ? "You already approved this request."
                      : request.status !== "PENDING"
                        ? `No approval needed while status is ${request.status}.`
                        : "This profile is not an eligible voter for this request."}
                  </small>
                )}
                {request.memberSends.map((send) => (
                  <div className="chain-progress" key={send.memberSendId}>
                    {send.chainType}: {sendActionLabel(send)} — {send.status}
                  </div>
                ))}
              </article>
            );
          })}
        </div>
      </div>

      {(flow.role?.onChainSigner || flow.sends.length > 0) && <div className="member-subpanel">
        <h3>Actions waiting for my signature</h3>
        <p>The assigned profile signs the raw 32-byte digest. The browser does not build a transaction.</p>
        {!flow.sends.length && <p className="muted">No signing actions assigned to this profile.</p>}
        {flow.sends.map((send) => {
          const problem = flow.signabilityError(send);
          const submitted = flow.submittedSends[send.memberSendId];
          return (
            <article className="request-card signing-card" key={send.memberSendId}>
              <div className="request-title">
                <strong className="action-label">{sendActionLabel(send)}</strong>
                <span className={`status status-${send.status}`}>{send.status}</span>
              </div>
              <dl className="compact-details">
                <div><dt>Assigned signer</dt><dd className="mono">{shortId(send.signerUserId)}</dd></div>
                <div><dt>Target user</dt><dd className="mono">{shortId(send.targetUserId)}</dd></div>
                <div><dt>Chain</dt><dd>{send.chainType} {send.chainId}</dd></div>
                <div><dt>Target key</dt><dd className="mono">{shortId(send.key)}</dd></div>
              </dl>
              {!send.send ? (
                <button
                  className="secondary"
                  onClick={() => void flow.prepareSend(send)}
                  disabled={busy || send.chainType !== "SOL" || send.signerUserId !== flow.actorUserId}
                >
                  {flow.busyAction === `prepare:${send.memberSendId}` ? "Loading…" : `Load payload: ${sendActionLabel(send)}`}
                </button>
              ) : (
                <>
                  <div className="signed-fields">
                    <strong>Review what Solflare will authorize</strong>
                    <dl className="compact-details">
                      <div><dt>Action</dt><dd>{send.send.signed.action.kind}</dd></div>
                      <div><dt>Space</dt><dd className="mono"><span className="copyable">{shortId(send.send.signed.space)}<CopyButton value={send.send.signed.space} label="Space address" /></span></dd></div>
                      <div><dt>Program</dt><dd className="mono"><span className="copyable">{shortId(send.send.signed.programId)}<CopyButton value={send.send.signed.programId} label="program address" /></span></dd></div>
                      <div><dt>Nonce</dt><dd>{send.send.signed.nonce}</dd></div>
                      <div><dt>Valid until</dt><dd>{new Date(send.send.signed.validUntil * 1000).toLocaleString()}</dd></div>
                      <div><dt>Digest</dt><dd className="mono"><span className="copyable">{shortId(send.send.digest)}<CopyButton value={send.send.digest} label="member-change digest" /></span></dd></div>
                    </dl>
                  </div>
                  {problem && <p className="blocking-reason">{problem}</p>}
                  <button
                    onClick={() => void flow.signAndSubmit(send)}
                    disabled={Boolean(problem) || busy}
                  >
                    {flow.busyAction === `submit:${send.memberSendId}`
                      ? "Opening Solflare…"
                      : `Sign and submit: ${sendActionLabel(send)}`}
                  </button>
                </>
              )}
              {(submitted || send.txHash) && (
                <div className="button-row"><CopyButton value={submitted?.txHash ?? send.txHash} label="transaction hash" /><a
                  href={`https://explorer.solana.com/tx/${submitted?.txHash ?? send.txHash}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View submitted transaction ↗
                </a></div>
              )}
            </article>
          );
        })}
      </div>}

      <div className="member-subpanel">
        <div className="section-heading">
          <div>
            <h3>Settled members</h3>
            <p>Roles change here only after backend and chain settlement.</p>
          </div>
          {settledRole && settledRole !== "OWNER" && (
            <button className="danger" onClick={() => void flow.leave()} disabled={busy}>
              Leave Space
            </button>
          )}
        </div>
        {spaceId && !flow.space && <p className="muted">Loading Space information and permissions…</p>}
        <div className="member-list">
          {flow.members.map((member) => (
            <article className="member-row" key={member.userId}>
              <div>
                <strong>{memberDisplayName(member)}</strong>
                <span>{member.role} · {member.status}</span>
                <span className="copyable"><code>{member.wallet?.address ?? "No Solana wallet"}</code><CopyButton value={member.wallet?.address} label={`${memberDisplayName(member)} wallet address`} /></span>
              </div>
              {canProposeMemberChange && member.status === "ACTIVE" && member.userId !== flow.actorUserId && (
                <div className="button-row">
                  <button
                    className="danger"
                    onClick={() => void flow.requestRemoval(member.userId)}
                    disabled={busy}
                  >
                    Remove member
                  </button>
                  {owner && canTransferOwnership && ["ADMIN", "MEMBER"].includes(member.role) && (
                    <button
                      onClick={() => void flow.requestHandover(member.userId)}
                      disabled={busy}
                    >
                      Make Owner
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

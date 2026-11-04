import React, { useCallback, useEffect, useState } from 'react';
import { logError } from '../utils/logger';
import {
  AdminRequiredError,
  fetchPipelineCockpit,
  runSelfHealNow,
  setAgenticFlag,
  setAutoDispatch,
  type AgenticFlagKey,
  type PipelineCockpit as Cockpit
} from '../data/agenticCockpit';

// The KI cockpit: a surface to STEER the enrichment pipeline as a whole, not browse items. Increment 1 is
// the levers strip (global auto-flags + dispatch switch + sweep-now) over a live health readout (queue +
// self-heal backlog). The findings-aggregation table ("what's systematically wrong") lands in increment 2.
// Read is open; the levers are admin-gated server-side — a non-admin sees them disabled with a note.

const FLAG_META: Array<{ key: AgenticFlagKey; label: string; hint: string }> = [
  { key: 'autoApprove', label: 'Auto-Freigabe', hint: 'Saubere, hochwertige Läufe ohne Review freigeben.' },
  { key: 'autoRework', label: 'Auto-Rework', hint: 'Veraltete freigegebene Artikel im Leerlauf neu anreichern.' },
  { key: 'autoReview', label: 'Auto-Review', hint: 'Veraltete Review-Artikel neu beurteilen (Queue schrumpfen).' }
];

function Lever({
  label, hint, on, busy, disabled, onToggle
}: { label: string; hint: string; on: boolean; busy: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <div className="cockpit-lever">
      <div className="cockpit-lever__text">
        <span className="cockpit-lever__label">{label}</span>
        <span className="cockpit-lever__hint muted">{hint}</span>
      </div>
      <button
        type="button"
        className={`cockpit-switch ${on ? 'is-on' : 'is-off'}`}
        onClick={onToggle}
        disabled={busy || disabled}
        aria-pressed={on}
        title={disabled ? 'Nur für Admins' : on ? 'Ausschalten' : 'Einschalten'}
      >
        {busy ? '…' : on ? 'An' : 'Aus'}
      </button>
    </div>
  );
}

function Stat({ value, label, tone }: { value: React.ReactNode; label: string; tone?: 'warn' | 'ok' }) {
  return (
    <div className={`cockpit-stat${tone ? ` cockpit-stat--${tone}` : ''}`}>
      <span className="cockpit-stat__value">{value}</span>
      <span className="cockpit-stat__label muted">{label}</span>
    </div>
  );
}

export default function PipelineCockpit(): JSX.Element {
  const [data, setData] = useState<Cockpit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminDenied, setAdminDenied] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchPipelineCockpit());
    } catch (err) {
      logError('Failed to load pipeline cockpit', err);
      setError('Cockpit konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Every lever shares this envelope: run the admin call, treat 401/403 as "not an admin" (disable the
  // levers with a note rather than show an error), then re-read the cockpit so the UI reflects real state.
  const runLever = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusyKey(key);
    setSweepMsg(null);
    try {
      await fn();
      await load();
    } catch (err) {
      if (err instanceof AdminRequiredError) {
        setAdminDenied(true);
      } else {
        logError('Cockpit lever failed', err);
        setError('Aktion fehlgeschlagen.');
      }
    } finally {
      setBusyKey(null);
    }
  }, [load]);

  const onSweep = useCallback(() => runLever('sweep', async () => {
    const r = await runSelfHealNow();
    if (r.warmedUp === false) {
      setSweepMsg('Dispatcher noch nicht bereit — läuft beim nächsten Tick.');
    } else if ((r.enqueued?.length ?? 0) === 0 && (r.restamped ?? 0) === 0) {
      setSweepMsg(r.reason === 'no-flags-enabled'
        ? 'Keine Aktion: Auto-Rework/Auto-Review sind aus.'
        : `Keine Aktion: ${r.staleCount ?? 0} veraltet (${r.reason ?? '—'}).`);
    } else {
      const parts: string[] = [];
      if (r.enqueued?.length) parts.push(`${r.enqueued.length} neu eingereiht`);
      if (r.restamped) parts.push(`${r.restamped} neu gestempelt`);
      setSweepMsg(parts.join(' · '));
    }
  }), [runLever]);

  return (
    <div className="list-container cockpit">
      <div className="list-header">
        <h2>KI-Cockpit</h2>
        <p className="muted cockpit__intro">
          Die Datenqualität der Pipeline steuern — globale Hebel und der Zustand auf einen Blick, nicht
          Artikel durchblättern.
        </p>
      </div>

      {loading ? (
        <p className="muted">Lade…</p>
      ) : error && !data ? (
        <p className="alert alert-error">{error}</p>
      ) : data ? (
        <>
          <section className="card cockpit-panel">
            <div className="cockpit-panel__head">
              <h3>Hebel</h3>
              {adminDenied && <span className="muted">Nur für Admins — Anzeige ist aktuell, Schalter gesperrt.</span>}
            </div>
            <div className="cockpit-levers">
              {FLAG_META.map((f) => (
                <Lever
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  on={data.flags[f.key]}
                  busy={busyKey === f.key}
                  disabled={adminDenied}
                  onToggle={() => void runLever(f.key, () => setAgenticFlag(f.key, !data.flags[f.key]))}
                />
              ))}
              <Lever
                label="Auto-Verteilung"
                hint="Freie Slots mit noch nicht gestarteten Artikeln füllen."
                on={data.autoDispatch}
                busy={busyKey === 'dispatch'}
                disabled={adminDenied}
                onToggle={() => void runLever('dispatch', () => setAutoDispatch(!data.autoDispatch))}
              />
            </div>
            <div className="cockpit-panel__actions">
              <button type="button" className="btn" disabled={busyKey === 'sweep' || adminDenied} onClick={onSweep}>
                {busyKey === 'sweep' ? 'Läuft…' : 'Sweep jetzt'}
              </button>
              <button type="button" className="btn" disabled={busyKey !== null} onClick={() => void load()}>
                Aktualisieren
              </button>
              {sweepMsg && <span className="muted">{sweepMsg}</span>}
              {error && data && <span className="alert alert-error" style={{ margin: 0 }}>{error}</span>}
            </div>
            <p className="muted cockpit-note">
              Hebel wirken ab dem nächsten Dispatch-Tick und überdauern einen Neustart (in den
              Systemeinstellungen gespeichert). Schwellen unten sind per Umgebungsvariable gesetzt.
            </p>
          </section>

          <section className="card cockpit-panel">
            <h3>Zustand</h3>
            <div className="cockpit-stats">
              <Stat value={data.queue.running} label="laufend" />
              <Stat value={data.queue.waiting} label={`wartend (max ${data.thresholds.maxWaitingRuns})`} />
              <Stat value={data.queue.notStarted} label="nicht gestartet" />
              <Stat
                value={data.selfHeal.staleCount}
                label="veraltet (Self-Heal)"
                tone={data.selfHeal.staleCount > 0 ? 'warn' : 'ok'}
              />
            </div>
            <div className="cockpit-breakdown">
              <div>
                <h4 className="muted">Self-Heal-Aktionen</h4>
                <div className="admin-status-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <span>Rework: {data.selfHeal.counts.rework}</span>
                  <span>Rerun: {data.selfHeal.counts.rerun}</span>
                  <span>Reword: {data.selfHeal.counts.reword}</span>
                  <span>Restamp: {data.selfHeal.counts.restamp}</span>
                </div>
              </div>
              <div>
                <h4 className="muted">Veraltet nach Status</h4>
                <div className="admin-status-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {Object.keys(data.selfHeal.byStatus).length === 0
                    ? <span className="muted">—</span>
                    : Object.entries(data.selfHeal.byStatus).map(([status, n]) => (
                      <span key={status}>{status}: {n}</span>
                    ))}
                </div>
              </div>
            </div>
            <p className="muted cockpit-note">
              Standards-Version: {data.selfHeal.standardsVersion ?? '—'} · Auto-Freigabe ab Datenqualität{' '}
              {data.thresholds.autoApproveMinGrade}/5 · Self-Heal-Abklingzeit{' '}
              {data.thresholds.selfHealCooldownMinutes} Min. Nur Artikel mit Spec-Contract werden vom
              Self-Heal erfasst.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

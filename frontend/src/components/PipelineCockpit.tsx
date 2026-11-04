import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { logError } from '../utils/logger';
import { useTaxonomy } from '../context/TaxonomyContext';
import { describeAgenticStatus } from '../lib/agenticStatusLabels';
import { ensureActorOrAlert } from './relocation/relocationHelpers';
import {
  AdminRequiredError,
  fetchPipelineCockpit,
  fetchFindingsAggregate,
  reworkItem,
  runSelfHealNow,
  setAgenticFlag,
  setAutoDispatch,
  type AgenticFlagKey,
  type FindingCluster,
  type FindingSeverity,
  type FindingType,
  type PipelineCockpit as Cockpit,
  type PipelineFindingsAggregate
} from '../data/agenticCockpit';

// The KI cockpit: a surface to STEER the enrichment pipeline as a whole, not browse items.
//  - Levers strip (increment 1): global auto-flags + dispatch switch + sweep-now over a health readout.
//  - Findings + behaviour (increment 2): a pipeline-status chart and findings aggregated into CLASSES of
//    problem (type × field × subcategory), each with a bounded cohort-rework lever. Built from the stored
//    per-run findings snapshot — classes to fix at the root, not rows to hand-edit.
// Read is open; the levers are admin-gated server-side — a non-admin sees them disabled with a note.

const REWORK_CAP = 25; // bound a cohort rework so one click can't flood the queue; the rest wait for a re-run.

const FLAG_META: Array<{ key: AgenticFlagKey; label: string; hint: string }> = [
  { key: 'autoApprove', label: 'Auto-Freigabe', hint: 'Saubere, hochwertige Läufe ohne Review freigeben.' },
  { key: 'autoRework', label: 'Auto-Rework', hint: 'Veraltete freigegebene Artikel im Leerlauf neu anreichern.' },
  { key: 'autoReview', label: 'Auto-Review', hint: 'Veraltete Review-Artikel neu beurteilen (Queue schrumpfen).' }
];

const FINDING_TYPE_LABELS: Record<FindingType, string> = {
  missing_required: 'Pflichtfeld fehlt',
  banned_phrase: 'Unerwünschter Text',
  intake_conflict: 'Intake-Konflikt',
  standards: 'Standards-Verstoß'
};

const SEVERITY_LABELS: Record<FindingSeverity, string> = { block: 'Blockierend', warn: 'Warnung', info: 'Hinweis' };
const SEVERITY_TONE: Record<FindingSeverity, 'danger' | 'warn' | 'muted'> = { block: 'danger', warn: 'warn', info: 'muted' };

// Map a run status to a semantic colour class for the chart bar (reserved status tokens, always labelled).
function statusTone(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (status === 'approved' || status === 'auto_approved') return 'ok';
  if (status === 'review') return 'warn';
  if (status === 'failed' || status === 'rejected' || status === 'cancelled') return 'danger';
  return 'neutral';
}

function clusterKey(c: FindingCluster): string {
  return `${c.type}||${c.field ?? ''}||${c.subCategory ?? ''}`;
}

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

function Stat({ value, label, tone }: { value: React.ReactNode; label: string; tone?: 'warn' | 'ok' | 'danger' }) {
  return (
    <div className={`cockpit-stat${tone ? ` cockpit-stat--${tone}` : ''}`}>
      <span className="cockpit-stat__value">{value}</span>
      <span className="cockpit-stat__label muted">{label}</span>
    </div>
  );
}

export default function PipelineCockpit(): JSX.Element {
  const { lookups } = useTaxonomy();
  const [data, setData] = useState<Cockpit | null>(null);
  const [findings, setFindings] = useState<PipelineFindingsAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminDenied, setAdminDenied] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [clusterMsg, setClusterMsg] = useState<string | null>(null);

  const loadLevers = useCallback(async () => {
    try {
      setError(null);
      setData(await fetchPipelineCockpit());
    } catch (err) {
      logError('Failed to load pipeline cockpit', err);
      setError('Cockpit konnte nicht geladen werden.');
    }
  }, []);

  const loadFindings = useCallback(async () => {
    try {
      setFindings(await fetchFindingsAggregate());
    } catch (err) {
      logError('Failed to load findings aggregate', err);
    }
  }, []);

  useEffect(() => {
    // Levers + findings are independent; load both, drop the spinner once the levers (the fast call) land.
    void (async () => {
      await Promise.all([loadLevers(), loadFindings()]);
      setLoading(false);
    })();
  }, [loadLevers, loadFindings]);

  const runLever = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusyKey(key);
    setSweepMsg(null);
    try {
      await fn();
      await loadLevers();
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
  }, [loadLevers]);

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

  const subcatLabel = useCallback((code: number | null): string => {
    if (code == null) return 'ohne Kategorie';
    const sub = lookups.unter.get(code);
    return sub ? `${sub.labelExternal ?? sub.label} (${code})` : `Kat. ${code}`;
  }, [lookups]);

  // Rework a bounded batch of a cluster's items — attack the whole class at once, paced by the queue cap.
  const reworkCluster = useCallback(async (cluster: FindingCluster) => {
    const key = clusterKey(cluster);
    setBusyKey(key);
    setClusterMsg(null);
    try {
      const actor = await ensureActorOrAlert({ context: 'cockpit cohort rework' });
      if (!actor) { setClusterMsg('Abgebrochen: kein Benutzername.'); return; }
      const batch = cluster.sample.slice(0, REWORK_CAP);
      let ok = 0;
      const failures: string[] = [];
      for (const nr of batch) {
        try { await reworkItem(nr, actor, cluster.field); ok += 1; }
        catch (err) { failures.push((err as Error).message); }
      }
      const capped = cluster.count > batch.length ? ` (von ${cluster.count}, Rest beim nächsten Durchlauf)` : '';
      setClusterMsg(failures.length
        ? `${ok} eingereiht, ${failures.length} fehlgeschlagen${capped}.`
        : `${ok} zur Überarbeitung eingereiht${capped}.`);
      await loadLevers(); // queue count moves immediately; findings update once the runs complete
    } catch (err) {
      logError('Cohort rework failed', err);
      setClusterMsg('Überarbeitung fehlgeschlagen.');
    } finally {
      setBusyKey(null);
    }
  }, [loadLevers]);

  const statusMax = useMemo(
    () => Math.max(1, ...(findings?.statusDistribution.map((s) => s.count) ?? [1])),
    [findings]
  );

  return (
    <div className="list-container cockpit">
      <div className="list-header">
        <h2>KI-Cockpit</h2>
        <p className="muted cockpit__intro">
          Die Datenqualität der Pipeline steuern — globale Hebel, Verhalten und offene Befunde auf einen
          Blick, nicht Artikel durchblättern.
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
              <button type="button" className="btn" disabled={busyKey !== null} onClick={() => { void loadLevers(); void loadFindings(); }}>
                Aktualisieren
              </button>
              {sweepMsg && <span className="muted">{sweepMsg}</span>}
            </div>
            <p className="muted cockpit-note">
              Hebel wirken ab dem nächsten Dispatch-Tick und überdauern einen Neustart. Auto-Freigabe ab
              Datenqualität {data.thresholds.autoApproveMinGrade}/5 · max. {data.thresholds.maxWaitingRuns}
              {' '}wartende Läufe · Self-Heal-Abklingzeit {data.thresholds.selfHealCooldownMinutes} Min.
            </p>
          </section>

          <section className="card cockpit-panel">
            <h3>Verhalten der Pipeline</h3>
            {findings ? (
              <>
                <div className="cockpit-chart" role="img" aria-label="Verteilung der Artikel nach KI-Status">
                  {findings.statusDistribution.map((s) => (
                    <div className="cockpit-bar-row" key={s.status}>
                      <span className="cockpit-bar-row__label">{describeAgenticStatus(s.status as Parameters<typeof describeAgenticStatus>[0])}</span>
                      <div className="cockpit-bar-track">
                        <div
                          className={`cockpit-bar cockpit-bar--${statusTone(s.status)}`}
                          style={{ width: `${Math.max(2, (s.count / statusMax) * 100)}%` }}
                        />
                      </div>
                      <span className="cockpit-bar-row__value">{s.count}</span>
                    </div>
                  ))}
                </div>
                <p className="muted cockpit-note">{findings.totalRuns} Läufe insgesamt.</p>
              </>
            ) : (
              <p className="muted">Befunde konnten nicht geladen werden.</p>
            )}
          </section>

          {findings && (
            <section className="card cockpit-panel">
              <h3>Offene Befunde — was systematisch fehlt</h3>
              <div className="cockpit-stats">
                <Stat value={findings.itemsBySeverity.block} label="Artikel mit blockierendem Befund" tone={findings.itemsBySeverity.block > 0 ? 'danger' : 'ok'} />
                <Stat value={findings.itemsBySeverity.warn} label="mit Warnung" tone={findings.itemsBySeverity.warn > 0 ? 'warn' : 'ok'} />
                <Stat value={findings.itemsBySeverity.info} label="mit Hinweis" />
              </div>

              {findings.clusters.length === 0 ? (
                <p className="muted" style={{ marginTop: 10 }}>Keine offenen Befunde in den gespeicherten Läufen. 🎉</p>
              ) : (
                <>
                  <table className="details cockpit-clusters" style={{ marginTop: 10 }}>
                    <thead>
                      <tr><th>Befund</th><th>Kategorie</th><th>Schwere</th><th>Anzahl</th><th>Aktion</th></tr>
                    </thead>
                    <tbody>
                      {findings.clusters.map((c) => {
                        const key = clusterKey(c);
                        const isOpen = expanded === key;
                        return (
                          <React.Fragment key={key}>
                            <tr>
                              <td>
                                <button type="button" className="cockpit-linkbtn" onClick={() => setExpanded(isOpen ? null : key)}>
                                  {isOpen ? '▾' : '▸'} {FINDING_TYPE_LABELS[c.type]}
                                  {c.field ? <span className="muted"> · {c.field}</span> : null}
                                </button>
                              </td>
                              <td>{subcatLabel(c.subCategory)}</td>
                              <td>
                                <span className={`status-badge cockpit-sev cockpit-sev--${SEVERITY_TONE[c.severity]}`}>
                                  {SEVERITY_LABELS[c.severity]}
                                </span>
                              </td>
                              <td><strong>{c.count}</strong></td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-small"
                                  disabled={busyKey === key}
                                  onClick={() => void reworkCluster(c)}
                                  title={`Bis zu ${REWORK_CAP} Artikel dieser Klasse überarbeiten`}
                                >
                                  {busyKey === key ? 'Läuft…' : `Überarbeiten (max ${REWORK_CAP})`}
                                </button>
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="cockpit-cluster-detail">
                                <td colSpan={5}>
                                  <div className="cockpit-chips">
                                    {c.sample.map((nr) => (
                                      <Link key={nr} to={`/items/${encodeURIComponent(nr)}`} className="cockpit-chip">{nr}</Link>
                                    ))}
                                    {c.count > c.sample.length && <span className="muted">+{c.count - c.sample.length} weitere</span>}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  {findings.totalClusters > findings.clusters.length && (
                    <p className="muted cockpit-note">
                      {findings.clusters.length} von {findings.totalClusters} Befundklassen gezeigt (die
                      größten zuerst).
                    </p>
                  )}
                </>
              )}
              {clusterMsg && <p className="muted cockpit-note">{clusterMsg}</p>}
              <p className="muted cockpit-note">
                Aus den gespeicherten Lauf-Befunden aggregiert (Momentaufnahme je letztem Lauf).
                „Überarbeiten“ reiht gezielt das betroffene Feld neu ein; die Queue-Obergrenze taktet die
                Ausführung.
              </p>
            </section>
          )}

          {error && data && <p className="alert alert-error">{error}</p>}
        </>
      ) : null}
    </div>
  );
}

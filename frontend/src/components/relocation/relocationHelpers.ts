import { dialogService } from '../dialog';
import { ensureUser } from '../../lib/user';

interface EnsureActorOptions {
  context?: string;
  alertTitle?: string;
  alertMessage?: string;
  resolveActor?: () => Promise<string>;
}

export async function ensureActorOrAlert({
  context = 'aktion',
  alertTitle = 'Aktion nicht möglich',
  alertMessage = 'Bitte zuerst oben den Benutzer setzen.',
  resolveActor = ensureUser
}: EnsureActorOptions = {}): Promise<string> {
  try {
    const resolved = await resolveActor();
    const actor = (resolved ?? '').trim();
    if (actor) {
      return actor;
    }
    console.info(`${context} abgebrochen: Kein Benutzer gesetzt.`);
  } catch (error) {
    console.error(`Benutzer konnte für ${context} nicht ermittelt werden`, error);
  }

  try {
    await dialogService.alert({
      title: alertTitle,
      message: alertMessage
    });
  } catch (error) {
    console.error(`Hinweisdialog für fehlenden Benutzer (${context}) fehlgeschlagen`, error);
  }

  return '';
}

interface CreateBoxOptions {
  actor: string;
  fetchImpl?: typeof fetch;
  context?: string;
}

interface CreateBoxResult {
  ok: boolean;
  boxId?: string;
  status?: number;
  message?: string;
  payload?: unknown;
}

export async function createBoxForRelocation({
  actor,
  fetchImpl = fetch,
  context = 'behälter anlegen'
}: CreateBoxOptions): Promise<CreateBoxResult> {
  try {
    const response = await fetchImpl('/api/boxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor })
    });

    const data = await response.json().catch((parseError) => {
      console.error('Antwort für Behälteranlage konnte nicht gelesen werden', {
        context,
        error: parseError
      });
      return {} as { id?: string; error?: string };
    });

    if (response.ok && typeof data.id === 'string' && data.id.trim()) {
      console.info('Create box succeeded', {
        status: response.status,
        boxId: data.id,
        context
      });
      return { ok: true, boxId: data.id, status: response.status, payload: data };
    }

    const message = 'Fehler: ' + ((data && data.error) || response.status);
    console.warn('Create box failed', {
      status: response.status,
      error: data?.error ?? data,
      context
    });
    return { ok: false, status: response.status, message, payload: data };
  } catch (error) {
    console.error('Create box request failed', { context, error });
    return {
      ok: false,
      status: 0,
      message: 'Behälter anlegen fehlgeschlagen',
      payload: error
    };
  }
}

export type { CreateBoxResult };

export interface EventLog {
  Id: number;
  CreatedAt: string;
  Actor?: string | null;
  EntityType: string;
  EntityId: string;
  Event: string;
  Meta?: string | null;
  Artikelbeschreibung?: string | null;
  Artikel_Nummer?: string | null;
}

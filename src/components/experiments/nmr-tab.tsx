'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface NmrExperiment {
  id: number;
  spectrometer: string | null;
  magnetic_field: number | null;
  temperature: number | null;
  labelling: string | null;
  bmrb_id: string | null;
  source_id: string | null;
  sample_ph: number | null;
  ionic_strength: string | null;
  pressure: string | null;
  conformers_calculated: number | null;
  conformers_submitted: number | null;
  notes: string | null;
  kbsi_nmr_spectrum: { id: number; spectrum_type: string }[];
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="inline-flex items-center gap-1 font-mono text-xs hover:underline">
      {children}
      <svg className="h-3 w-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

function ConditionItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

interface CsSummary {
  total_shifts: number;
  assigned_residues: number;
  h_count: number;
  n_count: number;
  ca_count: number;
  cb_count: number;
  ha_count: number;
  avg_h_shift: number | null;
  avg_n_shift: number | null;
  avg_ca_shift: number | null;
}

export function NmrTab({ data, csSummaries = {} }: { data: NmrExperiment[]; csSummaries?: Record<string, CsSummary> }) {
  return (
    <div className="space-y-4 mt-4">
      {data.length > 0 ? (
        <div className="space-y-3">
          {data.map((exp) => {
            const hasConditions = exp.temperature != null || exp.sample_ph != null
              || exp.labelling || exp.ionic_strength;
            const hasSpectra = exp.kbsi_nmr_spectrum?.length > 0;
            const hasEnsemble = exp.conformers_submitted != null;

            return (
              <Card key={exp.id}>
                <CardContent className="p-4 space-y-3">
                  {/* Row 1: Instrument + Links */}
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {exp.magnetic_field && (
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-sm font-semibold">
                          {exp.magnetic_field} MHz
                        </Badge>
                      )}
                      {exp.spectrometer && (
                        <span className="text-sm text-muted-foreground">{exp.spectrometer}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {exp.source_id && (
                        <ExternalLink href={`https://www.rcsb.org/structure/${exp.source_id}`}>
                          PDB: {exp.source_id}
                        </ExternalLink>
                      )}
                      {exp.bmrb_id && (
                        <ExternalLink href={`https://bmrb.io/data_library/summary/?bmrbId=${exp.bmrb_id}`}>
                          BMRB: {exp.bmrb_id}
                        </ExternalLink>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Sample Conditions */}
                  {hasConditions && (
                    <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md bg-muted/50 px-3 py-2">
                      {exp.temperature != null && (
                        <ConditionItem label="Temperature" value={`${exp.temperature}°C`} />
                      )}
                      {exp.sample_ph != null && (
                        <ConditionItem label="pH" value={exp.sample_ph} />
                      )}
                      {exp.ionic_strength && (
                        <ConditionItem label="Ionic Strength" value={exp.ionic_strength} />
                      )}
                      {exp.labelling && (
                        <ConditionItem label="Labelling" value={
                          <span className="font-mono">{exp.labelling}</span>
                        } />
                      )}
                    </div>
                  )}

                  {/* Row 3: Ensemble + Spectra */}
                  {(hasEnsemble || hasSpectra) && (
                    <div className="space-y-2">
                      {hasEnsemble && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Ensemble:</span>
                          <span className="font-medium">{exp.conformers_submitted} conformers</span>
                          {exp.conformers_calculated != null && (
                            <span className="text-muted-foreground">
                              / {exp.conformers_calculated} calculated
                            </span>
                          )}
                        </div>
                      )}
                      {hasSpectra && (
                        <div className="flex flex-wrap gap-1">
                          {exp.kbsi_nmr_spectrum.map((s) => (
                            <Badge key={s.id} variant="secondary" className="text-[10px]">
                              {s.spectrum_type}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Chemical Shift Summary */}
                  {exp.bmrb_id && csSummaries[exp.bmrb_id] && (() => {
                    const cs = csSummaries[exp.bmrb_id];
                    return (
                      <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">Backbone Chemical Shifts</span>
                          <span className="text-[10px] text-muted-foreground">
                            {cs.assigned_residues} residues · {cs.total_shifts} shifts
                          </span>
                        </div>
                        <div className="grid grid-cols-5 gap-2 text-center">
                          {[
                            { label: 'H', count: cs.h_count, avg: cs.avg_h_shift },
                            { label: 'N', count: cs.n_count, avg: cs.avg_n_shift },
                            { label: 'CA', count: cs.ca_count, avg: cs.avg_ca_shift },
                            { label: 'CB', count: cs.cb_count, avg: null },
                            { label: 'HA', count: cs.ha_count, avg: null },
                          ].map(atom => (
                            <div key={atom.label} className="rounded bg-background px-1 py-1">
                              <div className="text-[10px] text-muted-foreground">{atom.label}</div>
                              <div className="text-sm font-bold">{atom.count}</div>
                              {atom.avg != null && (
                                <div className="text-[9px] text-muted-foreground">{atom.avg} ppm</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Notes */}
                  {exp.notes && (
                    <p className="text-xs text-muted-foreground">{exp.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-8">No NMR experiment data yet.</p>
      )}
    </div>
  );
}

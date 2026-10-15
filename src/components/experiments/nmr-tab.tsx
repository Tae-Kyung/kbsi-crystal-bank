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
  notes: string | null;
  kbsi_nmr_spectrum: { id: number; spectrum_type: string }[];
}

export function NmrTab({ data }: { data: NmrExperiment[] }) {
  return (
    <div className="space-y-4 mt-4">
      {data.length > 0 ? (
        <div className="space-y-3">
          {data.map((exp) => (
            <Card key={exp.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {exp.spectrometer && (
                    <Badge variant="outline">{exp.spectrometer}</Badge>
                  )}
                  {exp.magnetic_field && (
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {exp.magnetic_field} MHz
                    </Badge>
                  )}
                  {exp.temperature != null && (
                    <span className="text-sm">{exp.temperature}°C</span>
                  )}
                  {exp.labelling && (
                    <Badge variant="outline" className="font-mono text-xs">
                      {exp.labelling}
                    </Badge>
                  )}
                  {exp.source_id && (
                    <a
                      href={`https://www.rcsb.org/structure/${exp.source_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Badge
                        variant="outline"
                        className="font-mono cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                      >
                        PDB: {exp.source_id}
                        <svg className="inline-block ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </Badge>
                    </a>
                  )}
                  {exp.bmrb_id && (
                    <a
                      href={`https://bmrb.io/data_library/summary/?bmrbId=${exp.bmrb_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Badge
                        variant="outline"
                        className="font-mono cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950"
                      >
                        BMRB: {exp.bmrb_id}
                        <svg className="inline-block ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </Badge>
                    </a>
                  )}
                </div>
                {exp.kbsi_nmr_spectrum?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {exp.kbsi_nmr_spectrum.map((s) => (
                      <Badge key={s.id} variant="secondary" className="text-[10px]">
                        {s.spectrum_type}
                      </Badge>
                    ))}
                  </div>
                )}
                {exp.notes && (
                  <p className="text-xs text-muted-foreground mt-2">{exp.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-8">No NMR experiment data yet.</p>
      )}
    </div>
  );
}

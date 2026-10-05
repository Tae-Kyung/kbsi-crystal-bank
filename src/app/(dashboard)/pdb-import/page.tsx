import { PdbImportClient } from '@/components/pdb-import/pdb-import-client';
import { ConditionEnricher } from '@/components/pdb-import/condition-enricher';
import { NegativeControlGenerator } from '@/components/pdb-import/negative-control-generator';
import { MlExportCard } from '@/components/pdb-import/ml-export-card';
import { DataCollectionStatus } from '@/components/pdb-import/data-collection-status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DataManagementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Data Management</h2>
        <p className="text-muted-foreground mt-1">
          데이터 수집 현황, PDB Import, 조건 파싱, Negative Control 생성, ML Export를 관리합니다.
        </p>
      </div>

      {/* Section 1: Overview */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Overview</h3>
        <DataCollectionStatus />
      </div>

      {/* Section 2: PDB Import */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">PDB Import</h3>
        <PdbImportClient />
      </div>

      {/* Section 3: Condition Enrichment */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Condition Enrichment</h3>
        <ConditionEnricher />
      </div>

      {/* Section 4: Negative Control */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Negative Control</h3>
        <NegativeControlGenerator />
      </div>

      {/* Section 5: ML Export */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">ML Export</h3>
        <MlExportCard />
      </div>
    </div>
  );
}

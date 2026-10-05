import { PdbImportClient } from '@/components/pdb-import/pdb-import-client';
import { ConditionEnricher } from '@/components/pdb-import/condition-enricher';
import { NegativeControlGenerator } from '@/components/pdb-import/negative-control-generator';
import { MlExportCard } from '@/components/pdb-import/ml-export-card';
import { DataCollectionStatus } from '@/components/pdb-import/data-collection-status';

export default function DataManagementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Data Management</h2>
        <p className="text-muted-foreground mt-1">
          데이터 수집 현황, PDB Import, 조건 파싱, Negative Control 생성, ML Export를 관리합니다.
        </p>
      </div>

      {/* 수집 현황 + 데이터 품질 */}
      <DataCollectionStatus />

      {/* PDB Import */}
      <PdbImportClient />

      {/* Condition Enrichment */}
      <ConditionEnricher />

      {/* Negative Control */}
      <NegativeControlGenerator />

      {/* ML Export */}
      <MlExportCard />
    </div>
  );
}

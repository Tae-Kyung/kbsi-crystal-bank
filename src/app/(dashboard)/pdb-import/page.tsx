import { PdbImportClient } from '@/components/pdb-import/pdb-import-client';
import { ConditionEnricher } from '@/components/pdb-import/condition-enricher';
import { NegativeControlGenerator } from '@/components/pdb-import/negative-control-generator';
import { MlExportCard } from '@/components/pdb-import/ml-export-card';

export default function PdbImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">PDB Import</h2>
        <p className="text-muted-foreground mt-1">
          PDB ID 또는 단백질명으로 검색하여 공개 데이터를 가져옵니다.
        </p>
      </div>
      <PdbImportClient />
      <ConditionEnricher />
      <NegativeControlGenerator />
      <MlExportCard />
    </div>
  );
}

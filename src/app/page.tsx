import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">
        KBSI Protein Crystallization Bank
      </h1>
      <p className="text-lg text-gray-600 mb-8 text-center max-w-2xl">
        단백질 결정화은행 기반 신약개발 AI 데이터 허브
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/proteins"
          className="p-6 border rounded-lg hover:border-blue-500 transition-colors"
        >
          <h2 className="text-xl font-semibold mb-2">Proteins</h2>
          <p className="text-sm text-gray-500">단백질 기본 정보 관리</p>
        </Link>
        <Link
          href="/constructs"
          className="p-6 border rounded-lg hover:border-blue-500 transition-colors"
        >
          <h2 className="text-xl font-semibold mb-2">Constructs</h2>
          <p className="text-sm text-gray-500">Construct 및 실험 데이터</p>
        </Link>
        <Link
          href="/experiments"
          className="p-6 border rounded-lg hover:border-blue-500 transition-colors"
        >
          <h2 className="text-xl font-semibold mb-2">Experiments</h2>
          <p className="text-sm text-gray-500">발현, 정제, 결정화, 구조결정</p>
        </Link>
      </div>
    </main>
  );
}

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KBSI Protein Crystallization Bank',
  description: '단백질 결정화은행 기반 신약개발 AI 데이터 허브',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-background antialiased">
        {children}
      </body>
    </html>
  );
}

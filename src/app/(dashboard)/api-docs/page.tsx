'use client';

import { useEffect, useState } from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

export default function ApiDocsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading API documentation...</p>
      </div>
    );
  }

  return (
    <div className="swagger-wrapper">
      <SwaggerUI url="/api/openapi" />
      <style jsx global>{`
        .swagger-wrapper .swagger-ui {
          font-family: inherit;
        }
        .swagger-wrapper .swagger-ui .info .title {
          font-size: 1.5rem;
        }
        /* Dark mode support */
        .dark .swagger-wrapper .swagger-ui {
          filter: invert(88%) hue-rotate(180deg);
        }
        .dark .swagger-wrapper .swagger-ui .model-box {
          filter: invert(100%) hue-rotate(180deg);
        }
      `}</style>
    </div>
  );
}

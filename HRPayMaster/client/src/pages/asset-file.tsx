import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import { TDocumentDefinitions } from "pdfmake/interfaces";
import { openPdf } from "@/lib/pdf";
import { useEffect } from "react";

export default function AssetFile() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const id = params.get('id') || '';
  const { data: asset } = useQuery<any>({ queryKey: ["/api/assets", id], enabled: !!id });
  const { data: assignments = [] } = useQuery<any[]>({ queryKey: ["/api/asset-assignments"], enabled: !!id });

  useEffect(() => {
    if (!asset) return;
    const history = (assignments || []).filter(a => a.assetId === id);
    const doc: TDocumentDefinitions = {
      info: { title: `Asset File - ${asset.name}` },
      content: [
        { text: 'Asset File', style: 'header' },
        { text: `Name: ${asset.name}` },
        { text: `Type: ${asset.type}` },
        { text: `Status: ${asset.status}` },
        { text: 'Assignments', style: 'subheader', margin: [0,10,0,5] },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto'],
            body: [
              ['Employee', 'Assigned', 'Returned', 'Status'],
              ...history.map((h: any) => [
                `${h.employee?.firstName ?? ''} ${h.employee?.lastName ?? ''}`,
                h.assignedDate,
                h.returnDate || '-',
                h.status,
              ])
            ],
          },
        }
      ],
      styles: { header: { fontSize: 16, bold: true }, subheader: { fontSize: 14, bold: true } },
    };
    openPdf(doc);
  }, [asset, assignments, id]);

  return null;
}


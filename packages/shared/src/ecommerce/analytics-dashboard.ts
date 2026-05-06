// Este modulo monta a visao administrativa de analytics a partir de dados agregados.
// PDF e tratado como job assincrono para nao afetar TTFB da dashboard.
export type AnalyticsPeriod = 'day' | 'month' | 'year';

export interface AnalyticsFilter {
  storeId: string;
  period: AnalyticsPeriod;
  startDate: Date;
  endDate: Date;
}

export interface SalesKPI {
  conversionRate: number;
  averageTicket: number;
  totalRevenue: number;
  totalOrders: number;
  totalVisitors: number;
  customerLifetimeValue: number;
  customerAcquisitionCost: number;
}

export interface ProductRankingItem {
  productId: string;
  productName: string;
  quantitySold: number;
  revenue: number;
  rank: number;
}

export interface TimeSeriesPoint {
  label: string;
  value: number;
}

export interface AnalyticsDashboardData {
  kpis: SalesKPI;
  revenueSeries: TimeSeriesPoint[];
  ordersSeries: TimeSeriesPoint[];
  topSellingProducts: ProductRankingItem[];
  lowestSellingProducts: ProductRankingItem[];
}

export interface SalesReport {
  reportId: string;
  storeId: string;
  filter: AnalyticsFilter;
  dashboard: AnalyticsDashboardData;
  generatedAt: Date;
  generatedBy?: string;
  notes?: string;
}

export interface ReportPdfExport {
  exportId: string;
  reportId: string;
  storeId: string;
  storagePath: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  createdAt: Date;
}

export interface AnalyticsSnapshot {
  snapshotId: string;
  storeId: string;
  period: AnalyticsPeriod;
  startDate: Date;
  endDate: Date;
  totalRevenue: number;
  totalOrders: number;
  totalVisitors: number;
  totalCustomers: number;
  totalMarketingSpend: number;
  revenueSeries: TimeSeriesPoint[];
  ordersSeries: TimeSeriesPoint[];
  productRanking: ProductRankingItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalyticsRepository {
  getTotalRevenue(filter: AnalyticsFilter): Promise<number>;
  getTotalOrders(filter: AnalyticsFilter): Promise<number>;
  getTotalVisitors(filter: AnalyticsFilter): Promise<number>;
  getTotalCustomers(filter: AnalyticsFilter): Promise<number>;
  getTotalMarketingSpend(filter: AnalyticsFilter): Promise<number>;
  getRevenueSeries(filter: AnalyticsFilter): Promise<TimeSeriesPoint[]>;
  getOrdersSeries(filter: AnalyticsFilter): Promise<TimeSeriesPoint[]>;
  getProductSalesRanking(filter: AnalyticsFilter): Promise<ProductRankingItem[]>;
  saveSnapshot(snapshot: AnalyticsSnapshot): Promise<AnalyticsSnapshot>;
  updateSnapshot(
    storeId: string,
    snapshotId: string,
    data: Partial<AnalyticsSnapshot>
  ): Promise<AnalyticsSnapshot>;
  deleteSnapshot(storeId: string, snapshotId: string): Promise<void>;
  saveSalesReport(report: SalesReport): Promise<SalesReport>;
  getSalesReport(storeId: string, reportId: string): Promise<SalesReport | null>;
  listSalesReports(storeId: string): Promise<SalesReport[]>;
  savePdfExport(pdfExport: ReportPdfExport): Promise<ReportPdfExport>;
  updatePdfExport(
    storeId: string,
    exportId: string,
    data: Partial<ReportPdfExport>
  ): Promise<ReportPdfExport>;
  getPdfExport(storeId: string, exportId: string): Promise<ReportPdfExport | null>;
  listPdfExports(storeId: string, reportId?: string): Promise<ReportPdfExport[]>;
}

export interface PdfExportJobScheduler {
  enqueueSalesReportPdfExport(input: { report: SalesReport; storagePath: string }): Promise<{
    jobId: string;
    enqueuedAt: Date;
  }>;
}

export interface AnalyticsDashboardDependencies {
  analyticsRepository: AnalyticsRepository;
  pdfExportJobScheduler: PdfExportJobScheduler;
}

export class DefaultPdfExportJobScheduler implements PdfExportJobScheduler {
  // Fallback minimo para integracao inicial; em producao o ideal e usar fila ou worker real.
  public async enqueueSalesReportPdfExport(): Promise<{
    jobId: string;
    enqueuedAt: Date;
  }> {
    return {
      jobId: `pdf_export_${Date.now()}`,
      enqueuedAt: new Date(),
    };
  }
}

export class EcommerceAnalyticsDashboardService {
  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly pdfExportJobScheduler: PdfExportJobScheduler
  ) {}

  public static create(
    dependencies: AnalyticsDashboardDependencies
  ): EcommerceAnalyticsDashboardService {
    // Helper para reduzir boilerplate ao conectar o modulo no backend principal.
    return new EcommerceAnalyticsDashboardService(
      dependencies.analyticsRepository,
      dependencies.pdfExportJobScheduler
    );
  }

  public async buildDashboard(filter: AnalyticsFilter): Promise<AnalyticsDashboardData> {
    // Todas as leituras sao independentes e por isso rodam em paralelo.
    const [
      totalRevenue,
      totalOrders,
      totalVisitors,
      totalCustomers,
      totalMarketingSpend,
      revenueSeries,
      ordersSeries,
      productRanking,
    ] = await Promise.all([
      this.analyticsRepository.getTotalRevenue(filter),
      this.analyticsRepository.getTotalOrders(filter),
      this.analyticsRepository.getTotalVisitors(filter),
      this.analyticsRepository.getTotalCustomers(filter),
      this.analyticsRepository.getTotalMarketingSpend(filter),
      this.analyticsRepository.getRevenueSeries(filter),
      this.analyticsRepository.getOrdersSeries(filter),
      this.analyticsRepository.getProductSalesRanking(filter),
    ]);

    const conversionRate =
      totalVisitors > 0 ? Number(((totalOrders / totalVisitors) * 100).toFixed(2)) : 0;
    const averageTicket = totalOrders > 0 ? Number((totalRevenue / totalOrders).toFixed(2)) : 0;
    const customerLifetimeValue =
      totalCustomers > 0 ? Number((totalRevenue / totalCustomers).toFixed(2)) : 0;
    const customerAcquisitionCost =
      totalCustomers > 0 ? Number((totalMarketingSpend / totalCustomers).toFixed(2)) : 0;

    const rankedProducts = productRanking
      .sort((a, b) => b.quantitySold - a.quantitySold || b.revenue - a.revenue)
      .map((product, index) => ({
        ...product,
        rank: index + 1,
      }));

    return {
      kpis: {
        conversionRate,
        averageTicket,
        totalRevenue,
        totalOrders,
        totalVisitors,
        customerLifetimeValue,
        customerAcquisitionCost,
      },
      revenueSeries,
      ordersSeries,
      topSellingProducts: rankedProducts.slice(0, 10),
      lowestSellingProducts: [...rankedProducts]
        .sort((a, b) => a.quantitySold - b.quantitySold || a.revenue - b.revenue)
        .slice(0, 10)
        .map((product, index) => ({
          ...product,
          rank: index + 1,
        })),
    };
  }

  public async generateSalesReport(input: {
    filter: AnalyticsFilter;
    generatedBy?: string;
    notes?: string;
  }): Promise<SalesReport> {
    // O relatorio persiste o snapshot da dashboard para consulta e exportacao futuras.
    const dashboard = await this.buildDashboard(input.filter);
    const report: SalesReport = {
      reportId: this.buildReportId(input.filter),
      storeId: input.filter.storeId,
      filter: input.filter,
      dashboard,
      generatedAt: new Date(),
      generatedBy: input.generatedBy,
      notes: input.notes,
    };

    return this.analyticsRepository.saveSalesReport(report);
  }

  public async exportSalesReportPdf(storeId: string, reportId: string): Promise<ReportPdfExport> {
    // Apenas enfileira a exportacao e grava metadados; o arquivo real nasce fora da thread principal.
    const existingExport = (await this.analyticsRepository.listPdfExports(storeId, reportId)).find(
      (item) => item.status === 'queued' || item.status === 'processing' || item.status === 'ready'
    );

    if (existingExport) {
      return existingExport;
    }

    const report = await this.analyticsRepository.getSalesReport(storeId, reportId);

    if (!report) {
      throw new Error('Relatorio de vendas nao encontrado na infraestrutura de dados.');
    }

    const storagePath = this.buildPdfStoragePath(storeId, reportId);
    await this.pdfExportJobScheduler.enqueueSalesReportPdfExport({
      report,
      storagePath,
    });

    return this.analyticsRepository.savePdfExport({
      exportId: `${reportId}-pdf`,
      reportId,
      storeId,
      storagePath,
      status: 'queued',
      createdAt: new Date(),
    });
  }

  public async markPdfExportReady(storeId: string, exportId: string): Promise<ReportPdfExport> {
    return this.analyticsRepository.updatePdfExport(storeId, exportId, {
      status: 'ready',
    });
  }

  public async markPdfExportFailed(storeId: string, exportId: string): Promise<ReportPdfExport> {
    return this.analyticsRepository.updatePdfExport(storeId, exportId, {
      status: 'failed',
    });
  }

  public async getStoredSalesReport(
    storeId: string,
    reportId: string
  ): Promise<SalesReport | null> {
    return this.analyticsRepository.getSalesReport(storeId, reportId);
  }

  public async getStoredPdfExport(
    storeId: string,
    exportId: string
  ): Promise<ReportPdfExport | null> {
    return this.analyticsRepository.getPdfExport(storeId, exportId);
  }

  public async listSalesReports(storeId: string): Promise<SalesReport[]> {
    return this.analyticsRepository.listSalesReports(storeId);
  }

  public async listPdfExports(storeId: string, reportId?: string): Promise<ReportPdfExport[]> {
    return this.analyticsRepository.listPdfExports(storeId, reportId);
  }

  public async saveSnapshot(snapshot: AnalyticsSnapshot): Promise<AnalyticsSnapshot> {
    return this.analyticsRepository.saveSnapshot(snapshot);
  }

  public async updateSnapshot(
    storeId: string,
    snapshotId: string,
    data: Partial<AnalyticsSnapshot>
  ): Promise<AnalyticsSnapshot> {
    return this.analyticsRepository.updateSnapshot(storeId, snapshotId, data);
  }

  public async deleteSnapshot(storeId: string, snapshotId: string): Promise<void> {
    await this.analyticsRepository.deleteSnapshot(storeId, snapshotId);
  }

  private buildReportId(filter: AnalyticsFilter): string {
    return `sales_${filter.period}_${filter.startDate.toISOString()}_${filter.endDate.toISOString()}`;
  }

  private buildPdfStoragePath(storeId: string, reportId: string): string {
    return `reports/${storeId}/${reportId}.pdf`;
  }
}

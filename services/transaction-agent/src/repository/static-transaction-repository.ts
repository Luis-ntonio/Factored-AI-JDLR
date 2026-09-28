import type { Customer, Product, Transaction } from "../data/mock-core-banking";
import { CUSTOMERS, PRODUCTS, TRANSACTIONS } from "../data/mock-core-banking";
import type { ListLookupResult, LookupResult, TransactionCandidateFilters, TransactionRepository } from "./types";

/**
 * Implementación por DEFECTO de este checkpoint (mismo criterio que
 * `StaticCatalogRepository` de retrieval-agent): respaldada por el archivo
 * de datos versionado en el repo (`src/data/mock-core-banking.ts`), no por
 * AWS. El mismo patrón `CATALOG_BACKEND` de retrieval-agent aplicaría acá
 * más adelante (ej. `CORE_BANKING_BACKEND=dynamodb`) cuando devops provisione
 * las tablas reales -- NO implementado en este checkpoint, es trabajo de
 * infra/fase de Act.
 *
 * Al ser datos en memoria del propio proceso, no hay superficie de fallo de
 * red/infra que reintentar -- el único resultado posible además de "found"
 * es "not_found" (nunca "unavailable"), lo cual es intencional y documentado
 * (mismo razonamiento que `StaticCatalogRepository`).
 */

/** Tolerancia de monto: 1% del monto recordado por el cliente, con un piso
 * absoluto de 0.5 unidades monetarias. Un cliente que disputa un cargo casi
 * nunca recuerda el monto exacto (ej. "creo que fueron como $45"), pero sí
 * suele acertar dentro de un margen chico -- 1% cubre errores de redondeo o
 * de memoria de centavos; el piso de 0.5 evita que montos muy chicos (ej.
 * $1.00) terminen con una tolerancia casi nula por el porcentaje. Documentado
 * como decisión de autoría de este checkpoint, ajustable si
 * verification-agent encuentra que es muy laxa/estricta en la práctica. */
const AMOUNT_TOLERANCE_RATIO = 0.01;
const AMOUNT_TOLERANCE_FLOOR = 0.5;

function amountMatches(transactionAmount: number, rememberedAmount: number): boolean {
  const tolerance = Math.max(Math.abs(rememberedAmount) * AMOUNT_TOLERANCE_RATIO, AMOUNT_TOLERANCE_FLOOR);
  return Math.abs(transactionAmount - rememberedAmount) <= tolerance;
}

/** Substring case-insensitive: cubre variaciones de cómo el cliente escribe
 * o recuerda el nombre del comercio (ej. "amazon" matchea "Amazon MX").
 * Transacciones sin `merchant_name` (ej. retiros de cajero) nunca matchean
 * un filtro de comercio -- no tiene sentido "disputar el comercio" de un
 * retiro. */
function merchantMatches(merchantName: string | undefined, needle: string): boolean {
  if (!merchantName) return false;
  return merchantName.toLowerCase().includes(needle.trim().toLowerCase());
}

/** Compara solo la parte de fecha (`yyyy-mm-dd`) de `transaction_date`
 * contra un rango inclusive -- comparación lexicográfica de strings ISO es
 * válida porque el formato es de ancho fijo. */
function dateInRange(transactionDateIso: string, range: { from: string; to: string }): boolean {
  const day = transactionDateIso.slice(0, 10);
  return day >= range.from && day <= range.to;
}

export class StaticTransactionRepository implements TransactionRepository {
  async findCustomerByDocumentNumber(documentNumber: string): Promise<LookupResult<Customer>> {
    const customer = CUSTOMERS.find((c) => c.document_number === documentNumber);
    if (!customer) return { status: "not_found" };
    return { status: "found", value: customer };
  }

  async listCustomerProducts(customerId: string): Promise<ListLookupResult<Product>> {
    const products = PRODUCTS.filter((p) => p.customer_id === customerId);
    if (products.length === 0) return { status: "not_found" };
    return { status: "found", value: products };
  }

  async findCandidateTransactions(
    customerId: string,
    filters: TransactionCandidateFilters = {}
  ): Promise<ListLookupResult<Transaction>> {
    const candidates = TRANSACTIONS.filter((t) => {
      if (t.customer_id !== customerId) return false;
      if (filters.merchant !== undefined && !merchantMatches(t.merchant_name, filters.merchant)) return false;
      if (filters.amount !== undefined && !amountMatches(t.amount, filters.amount)) return false;
      if (filters.dateRange !== undefined && !dateInRange(t.transaction_date, filters.dateRange)) return false;
      return true;
    });

    if (candidates.length === 0) return { status: "not_found" };
    return { status: "found", value: candidates };
  }
}

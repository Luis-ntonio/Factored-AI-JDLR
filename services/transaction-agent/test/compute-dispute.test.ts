import { describe, expect, it } from "vitest";
import { emptyEntities } from "@banking-agent/shared";
import type { Entities } from "@banking-agent/shared";
import { computeDisputeVerification, DisputeUnavailableError } from "../src/compute-dispute";
import { InMemoryDisputeStore } from "../src/store/in-memory-dispute-store";
import { StaticTransactionRepository } from "../src/repository/static-transaction-repository";
import type { DisputeGetResult, DisputePutResult, DisputeStore } from "../src/store/dispute-store-types";
import type {
  ListLookupResult,
  LookupResult,
  TransactionCandidateFilters,
  TransactionRepository,
} from "../src/repository/types";
import type { Customer, Product, Transaction } from "../src/data/mock-core-banking";
import type { DisputeVerificationResult } from "@banking-agent/shared";

/**
 * Tests de `computeDisputeVerification` (flujo Act NUEVO y aditivo,
 * `intent: dispute_unrecognized_charge`). Mismo criterio general que
 * `test/pipeline-integration.test.ts`: no tocan nada de elegibilidad.
 */

const CUST_0001_DOCUMENT = "LOTM900101MDFPRR09"; // María Fernanda López Torres

function baseEntities(overrides: Partial<Entities> = {}): Entities {
  return {
    ...emptyEntities(),
    document_id: CUST_0001_DOCUMENT,
    product_type: "credit_card",
    ...overrides,
  };
}

/** Repositorio configurable a mano, para forzar caminos que el seed real no
 * puede producir por sí solo (cliente sin tarjetas, `"unavailable"`, etc.),
 * y para contar invocaciones (test de idempotencia). */
class FakeTransactionRepository implements TransactionRepository {
  public findCustomerCalls = 0;
  public listProductsCalls = 0;
  public findTransactionsCalls = 0;

  constructor(
    private readonly customerResult: LookupResult<Customer>,
    private readonly productsResult: ListLookupResult<Product> = { status: "not_found" },
    private readonly transactionsResult: ListLookupResult<Transaction> = { status: "not_found" }
  ) {}

  async findCustomerByDocumentNumber(): Promise<LookupResult<Customer>> {
    this.findCustomerCalls += 1;
    return this.customerResult;
  }

  async listCustomerProducts(): Promise<ListLookupResult<Product>> {
    this.listProductsCalls += 1;
    return this.productsResult;
  }

  async findCandidateTransactions(
    _customerId: string,
    _filters?: TransactionCandidateFilters
  ): Promise<ListLookupResult<Transaction>> {
    this.findTransactionsCalls += 1;
    return this.transactionsResult;
  }
}

/** Store configurable a mano para forzar `"unavailable"` en lectura/escritura
 * -- `InMemoryDisputeStore` nunca devuelve ese estado por diseño. */
class FakeDisputeStore implements DisputeStore {
  public getResultCalls = 0;
  public putResultCalls = 0;

  constructor(
    private readonly getBehavior: DisputeGetResult | (() => DisputeGetResult) = { status: "not_found" },
    private readonly putBehavior: DisputePutResult | (() => DisputePutResult) = { status: "ok" }
  ) {}

  async getResult(): Promise<DisputeGetResult> {
    this.getResultCalls += 1;
    return typeof this.getBehavior === "function" ? this.getBehavior() : this.getBehavior;
  }

  async putResult(): Promise<DisputePutResult> {
    this.putResultCalls += 1;
    return typeof this.putBehavior === "function" ? this.putBehavior() : this.putBehavior;
  }
}

const NOT_FOUND: DisputeVerificationResult = {
  caseId: "",
  transactionFound: false,
  fraudSuspected: false,
  productBlocked: false,
};

describe("computeDisputeVerification — cliente no encontrado", () => {
  it("document_id sin match -> not found, PERSISTIDO igual que el camino feliz", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();

    const result = await computeDisputeVerification(
      { caseId: "case-1", turnId: "turn-1", language: "es", entities: baseEntities({ document_id: "NO-EXISTE-0000" }) },
      { store, repository }
    );

    expect(result).toEqual({ ...NOT_FOUND, caseId: "case-1" });
    const stored = await store.getResult("case-1", "turn-1");
    expect(stored).toEqual({ status: "found", value: result });
  });
});

describe("computeDisputeVerification — cliente sin tarjetas", () => {
  it("cliente encontrado pero sin ningún producto Credit Card/Debit Card -> not found", async () => {
    const store = new InMemoryDisputeStore();
    const customer: Customer = {
      customer_id: "CUST-FAKE",
      document_number: "FAKE-DOC",
      document_type: "DNI",
      first_name: "Fake",
      last_name: "Customer",
      date_of_birth: "1990-01-01",
      gender: "M",
      email: "fake@example.com",
      mobile_phone: "+00-0000-0000",
      address: "N/A",
      city: "N/A",
      state: "N/A",
      country: "Argentina",
      segment: "Basic",
      registration_date: "2020-01-01T00:00:00Z",
      registration_branch_id: "BR-000",
      customer_status: "Active",
      last_updated: "2020-01-01T00:00:00Z",
      accepts_marketing: false,
    };
    const onlyCheckingAccount: Product = {
      product_id: "PROD-FAKE-CHECKING",
      customer_id: "CUST-FAKE",
      product_type: "Checking Account",
      product_number: "0000",
      currency: "ARS",
      current_balance: 0,
      opening_date: "2020-01-01",
      opening_branch_id: "BR-000",
      product_status: "Active",
      opening_channel: "Branch",
      has_linked_app: false,
      last_updated: "2020-01-01T00:00:00Z",
    };
    const repository = new FakeTransactionRepository(
      { status: "found", value: customer },
      { status: "found", value: [onlyCheckingAccount] }
    );

    const result = await computeDisputeVerification(
      { caseId: "case-2", turnId: "turn-1", language: "es", entities: baseEntities({ document_id: "FAKE-DOC" }) },
      { store, repository }
    );

    expect(result).toEqual({ ...NOT_FOUND, caseId: "case-2" });
  });
});

describe("computeDisputeVerification — sobre el seed real (StaticTransactionRepository, CUST-0001)", () => {
  it("sin transacción candidata (comercio inexistente) -> not found", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();

    const result = await computeDisputeVerification(
      { caseId: "case-3", turnId: "turn-1", language: "es", entities: baseEntities({ merchant: "comercio-inexistente" }) },
      { store, repository }
    );

    expect(result).toEqual({ ...NOT_FOUND, caseId: "case-3" });
  });

  it("candidata ambigua (2+ matches, sin merchant/amount para acotar) -> ranker sin ninguna señal -> not found", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();

    // Sin merchant/disputed_amount/transaction_date, findCandidateTransactions
    // devuelve TODAS las transacciones de CUST-0001 sobre su única tarjeta
    // (PROD-0001) -- 6 candidatas (TXN-000001,2,3,5,6,25; TXN-000004 es de
    // PROD-0002, Checking Account, ya excluida por ownership). El ranker
    // (baseline, sin `embed` inyectado) no tiene NINGUNA señal para
    // distinguirlas -- todas empatan en score 0, nunca supera `tau`, nunca
    // "confiado". Comportamiento final idéntico al de antes de este matcher.
    const result = await computeDisputeVerification(
      { caseId: "case-4", turnId: "turn-1", language: "es", entities: baseEntities() },
      { store, repository }
    );

    expect(result).toEqual({
      ...NOT_FOUND,
      caseId: "case-4",
      // Top 5 de las 6 candidatas reales (todas score 0, orden estable =
      // orden original del mock) -- ver ambiguousCandidates.
      ambiguousCandidates: [
        { transactionId: "TXN-000001", merchant: "Amazon MX", amount: 1299, date: "2026-09-20" },
        { transactionId: "TXN-000002", merchant: "Netflix", amount: 219, date: "2026-09-22" },
        { transactionId: "TXN-000003", merchant: "Electronics Store Miami", amount: 19200, date: "2026-09-15" },
        { transactionId: "TXN-000005", merchant: "Starbucks Reforma", amount: 145, date: "2026-09-10" },
        { transactionId: "TXN-000006", merchant: "Uber", amount: 89.5, date: "2026-09-05" },
      ],
    });
  });

  it("candidata ambigua por MONTO (219, Netflix vs. Disney Plus) SIN señal de fecha, sin embed -> baseline empata -> not found", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();

    // Sin merchant ni transaction_date, solo disputed_amount: 219 matchea
    // TXN-000002 (Netflix) Y TXN-000025 (Disney Plus, fixture agregada para
    // este test) -- 2 candidatas reales, ninguna señal para romper el
    // empate. Confirma que el baseline (sin `embed`) preserva el
    // comportamiento ORIGINAL: nunca elige al azar.
    const result = await computeDisputeVerification(
      { caseId: "case-amb-1", turnId: "turn-1", language: "es", entities: baseEntities({ disputed_amount: 219 }) },
      { store, repository }
    );

    expect(result).toEqual({
      ...NOT_FOUND,
      caseId: "case-amb-1",
      ambiguousCandidates: [
        { transactionId: "TXN-000002", merchant: "Netflix", amount: 219, date: "2026-09-22" },
        { transactionId: "TXN-000025", merchant: "Disney Plus", amount: 219, date: "2026-09-08" },
      ],
    });
  });

  it("candidata ambigua por MONTO + 'la semana pasada' -> baseline SIGUE empatando (no resuelve fechas)", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();

    // El baseline premia PAREJO mencionar cualquier fecha (+0.25 para
    // ambas candidatas), nunca resuelve la ventana real -- demuestra el
    // límite real que motiva el modelo, no un baseline débil inventado.
    const result = await computeDisputeVerification(
      {
        caseId: "case-amb-2",
        turnId: "turn-1",
        language: "es",
        entities: baseEntities({ disputed_amount: 219, transaction_date: "la semana pasada" }),
      },
      { store, repository }
    );

    expect(result).toEqual({
      ...NOT_FOUND,
      caseId: "case-amb-2",
      ambiguousCandidates: [
        { transactionId: "TXN-000002", merchant: "Netflix", amount: 219, date: "2026-09-22" },
        { transactionId: "TXN-000025", merchant: "Disney Plus", amount: 219, date: "2026-09-08" },
      ],
    });
  });

  it("candidata ambigua por MONTO + 'la semana pasada' CON el matcher completo -> resuelve la fecha real y desambigua a Netflix", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();

    // TXN-000002 (Netflix, 2026-09-22) cae dentro de la ventana resuelta de
    // "la semana pasada" contada desde `now`; TXN-000025 (Disney Plus,
    // 2026-09-08, 3 semanas antes) queda AFUERA -- a diferencia del
    // baseline, el modelo sí resuelve la fecha real (resolve-relative-date.ts)
    // y rompe el empate con evidencia genuina, no al azar. `embed` se pasa
    // igual (simula que Bedrock SÍ está disponible) aunque acá no se llega
    // a usar -- no hay `merchant` en la consulta, el término de comercio se
    // omite con gracia.
    const embedNeverCalled = async () => {
      throw new Error("no debería llamarse -- entities.merchant es null en este caso");
    };

    const result = await computeDisputeVerification(
      {
        caseId: "case-amb-3",
        turnId: "turn-1",
        language: "es",
        entities: baseEntities({ disputed_amount: 219, transaction_date: "la semana pasada" }),
      },
      { store, repository, embed: embedNeverCalled, now: () => "2026-09-29T12:00:00Z" }
    );

    expect(result).toEqual({
      caseId: "case-amb-3",
      transactionFound: true,
      transactionId: "TXN-000002",
      fraudSuspected: false,
      productBlocked: true,
    });
  });

  it("candidata ambigua CON `embed` que falla (Bedrock no disponible) -> nunca crashea, cae a lo que el resto de señales permita", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();
    const failingEmbed = async () => null;

    const result = await computeDisputeVerification(
      {
        caseId: "case-amb-4",
        turnId: "turn-1",
        language: "es",
        entities: baseEntities({ disputed_amount: 219, transaction_date: "la semana pasada" }),
      },
      { store, repository, embed: failingEmbed, now: () => "2026-09-29T12:00:00Z" }
    );

    // Mismo resultado que el caso anterior -- la resolución de fecha (paso
    // puro, no depende de `embed`) sigue funcionando aunque el cliente de
    // embeddings falle por completo.
    expect(result).toEqual({
      caseId: "case-amb-4",
      transactionFound: true,
      transactionId: "TXN-000002",
      fraudSuspected: false,
      productBlocked: true,
    });
  });

  it("selectedTransactionId válido (respuesta a un CLARIFY post-Act previo) -> resuelve directo, sin correr el ranker", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();
    const embedNeverCalled = async (): Promise<null> => {
      throw new Error("no debería llamarse -- selectedTransactionId ya resuelve antes de correr el ranker");
    };

    // Mismas 2 candidatas ambiguas de case-amb-1 (TXN-000002/TXN-000025,
    // ambas 219 MXN), pero ahora el cliente ya eligió Disney Plus en un
    // turno anterior (ver policies.yaml, clarify-dispute-ambiguous-
    // candidates) -- se revalida contra las candidatas reales recalculadas
    // y se resuelve directo a esa, sin ambigüedad ni scoring.
    const result = await computeDisputeVerification(
      {
        caseId: "case-amb-5",
        turnId: "turn-1",
        language: "es",
        entities: baseEntities({ disputed_amount: 219 }),
        selectedTransactionId: "TXN-000025",
      },
      { store, repository, embed: embedNeverCalled }
    );

    expect(result).toEqual({
      caseId: "case-amb-5",
      transactionFound: true,
      transactionId: "TXN-000025",
      fraudSuspected: false,
      productBlocked: true,
    });
  });

  it("selectedTransactionId que NO es una candidata real (stale/manipulado) -> se ignora, cae al flujo normal de ranking", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();

    // "TXN-999999" no es ninguna de las candidatas reales de María -- nunca
    // se confía en el valor del cliente a ciegas. Mismo resultado que
    // case-amb-1 (sin selectedTransactionId): ninguna señal para
    // desambiguar, not found con ambiguousCandidates.
    const result = await computeDisputeVerification(
      {
        caseId: "case-amb-6",
        turnId: "turn-1",
        language: "es",
        entities: baseEntities({ disputed_amount: 219 }),
        selectedTransactionId: "TXN-999999",
      },
      { store, repository }
    );

    expect(result).toEqual({
      ...NOT_FOUND,
      caseId: "case-amb-6",
      ambiguousCandidates: [
        { transactionId: "TXN-000002", merchant: "Netflix", amount: 219, date: "2026-09-22" },
        { transactionId: "TXN-000025", merchant: "Disney Plus", amount: 219, date: "2026-09-08" },
      ],
    });
  });

  it("match único sin fraude (TXN-000001, Amazon MX) -> transactionFound true, productBlocked true", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();

    const result = await computeDisputeVerification(
      { caseId: "case-5", turnId: "turn-1", language: "es", entities: baseEntities({ merchant: "amazon" }) },
      { store, repository }
    );

    expect(result).toEqual({
      caseId: "case-5",
      transactionFound: true,
      transactionId: "TXN-000001",
      fraudSuspected: false,
      productBlocked: true,
    });
  });

  it("match único CON fraude (TXN-000003, $19,200 MXN, Miami) -> fraudSuspected true, productBlocked false", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();

    const result = await computeDisputeVerification(
      {
        caseId: "case-6",
        turnId: "turn-1",
        language: "es",
        entities: baseEntities({ merchant: "Electronics Store Miami", disputed_amount: 19200 }),
      },
      { store, repository }
    );

    expect(result).toEqual({
      caseId: "case-6",
      transactionFound: true,
      transactionId: "TXN-000003",
      fraudSuspected: true,
      productBlocked: false,
    });
  });
});

describe("computeDisputeVerification — idempotencia", () => {
  it("segunda invocación con el mismo caseId+turnId no vuelve a llamar al repositorio ni a recalcular", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new FakeTransactionRepository(
      { status: "not_found" } // cliente no encontrado, el camino más simple
    );
    const input = { caseId: "case-idem-1", turnId: "turn-idem-1", language: "es" as const, entities: baseEntities() };

    const first = await computeDisputeVerification(input, { store, repository });
    const second = await computeDisputeVerification(input, { store, repository });

    expect(second).toEqual(first);
    expect(store.getResultCalls).toBe(2); // el chequeo de idempotencia SIEMPRE se hace
    expect(repository.findCustomerCalls).toBe(1); // pero solo se buscó una vez
  });
});

describe("computeDisputeVerification — fallback ante fallos del backend simulado", () => {
  it("fallo de lectura del DisputeStore -> DisputeUnavailableError('dynamodb_read_failed'), nunca fabrica un resultado", async () => {
    const store = new FakeDisputeStore({ status: "unavailable", reason: "dynamodb_read_failed" });
    const repository = new StaticTransactionRepository();

    let caught: unknown;
    try {
      await computeDisputeVerification(
        { caseId: "case-7", turnId: "turn-1", language: "es", entities: baseEntities() },
        { store, repository }
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DisputeUnavailableError);
    expect((caught as DisputeUnavailableError).reason).toBe("dynamodb_read_failed");
  });

  it("fallo de escritura del DisputeStore -> DisputeUnavailableError('dynamodb_write_failed')", async () => {
    const store = new FakeDisputeStore(
      { status: "not_found" },
      { status: "unavailable", reason: "dynamodb_write_failed" }
    );
    const repository = new StaticTransactionRepository();

    let caught: unknown;
    try {
      await computeDisputeVerification(
        { caseId: "case-8", turnId: "turn-1", language: "es", entities: baseEntities() },
        { store, repository }
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DisputeUnavailableError);
    expect((caught as DisputeUnavailableError).reason).toBe("dynamodb_write_failed");
  });

  it("repositorio no disponible al buscar cliente -> DisputeUnavailableError('repository_unavailable')", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new FakeTransactionRepository({ status: "unavailable", reason: "core banking down" });

    let caught: unknown;
    try {
      await computeDisputeVerification(
        { caseId: "case-9", turnId: "turn-1", language: "es", entities: baseEntities() },
        { store, repository }
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DisputeUnavailableError);
    expect((caught as DisputeUnavailableError).reason).toBe("repository_unavailable");
  });
});

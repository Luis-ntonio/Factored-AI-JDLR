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
      { caseId: "case-1", turnId: "turn-1", entities: baseEntities({ document_id: "NO-EXISTE-0000" }) },
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
      { caseId: "case-2", turnId: "turn-1", entities: baseEntities({ document_id: "FAKE-DOC" }) },
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
      { caseId: "case-3", turnId: "turn-1", entities: baseEntities({ merchant: "comercio-inexistente" }) },
      { store, repository }
    );

    expect(result).toEqual({ ...NOT_FOUND, caseId: "case-3" });
  });

  it("candidata ambigua (2+ matches, sin merchant/amount para acotar) -> tratada como not found", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();

    // Sin merchant/disputed_amount, findCandidateTransactions devuelve TODAS
    // las transacciones de CUST-0001 sobre su única tarjeta (PROD-0001) -- 5
    // candidatas (TXN-000001,2,3,5,6; TXN-000004 es de PROD-0002, Checking
    // Account, ya excluida por ownership de tarjeta). Ambiguo a propósito.
    const result = await computeDisputeVerification(
      { caseId: "case-4", turnId: "turn-1", entities: baseEntities() },
      { store, repository }
    );

    expect(result).toEqual({ ...NOT_FOUND, caseId: "case-4" });
  });

  it("match único sin fraude (TXN-000001, Amazon MX) -> transactionFound true, productBlocked true", async () => {
    const store = new InMemoryDisputeStore();
    const repository = new StaticTransactionRepository();

    const result = await computeDisputeVerification(
      { caseId: "case-5", turnId: "turn-1", entities: baseEntities({ merchant: "amazon" }) },
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
    const input = { caseId: "case-idem-1", turnId: "turn-idem-1", entities: baseEntities() };

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
        { caseId: "case-7", turnId: "turn-1", entities: baseEntities() },
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
        { caseId: "case-8", turnId: "turn-1", entities: baseEntities() },
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
        { caseId: "case-9", turnId: "turn-1", entities: baseEntities() },
        { store, repository }
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DisputeUnavailableError);
    expect((caught as DisputeUnavailableError).reason).toBe("repository_unavailable");
  });
});

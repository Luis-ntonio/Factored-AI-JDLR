/**
 * Seed de datos SIMULADOS del "core bancario" (clientes, productos,
 * transacciones), versionado en el repo, para el flujo NUEVO y aditivo de
 * "transaction-dispute intake" (ver `hacka-info/EDA_LATAM_Bank_resumen.md`,
 * carpeta local gitignoreada, secciones 3 y 5: el EDA del dataset real LATAM
 * Bank encontró que `complaints` NO sirve para verificar nada (0 de 44,570
 * productos reclamados pertenecen al cliente que reclama), pero
 * `transactions`/`products` tienen integridad perfecta -- por eso este mock
 * NUNCA incluye datos de `complaints`, ni siquiera como referencia: toda
 * disputa se verifica contra transacciones reales del cliente.
 *
 * `SOURCE_ID` es el identificador de fuente para TODO este seed (mismo
 * patrón que `services/retrieval-agent/src/data/catalog.ts`). Nunca se
 * genera ni se ajusta en runtime -- `StaticTransactionRepository` lo sirve
 * tal cual está acá.
 *
 * IMPORTANTE -- procedencia de las columnas/tipos:
 * Los nombres y tipos de columna de `Customer`, `Product` y `Transaction` de
 * este archivo SÍ fueron verificados contra
 * `hacka-info/LATAM_Bank_Complete_Data_Dictionary.pdf` (páginas 4, 5 y 8 --
 * secciones "Dimension Tables" y "Fact Tables"). Por una regla de seguridad
 * explícita de esta tarea, la página 2 de ese PDF (que contiene credenciales
 * reales de AWS del hackathon) NUNCA se leyó ni se extrajo, en ningún
 * formato -- la extracción se hizo página por página (`pdftotext -f N -l N`)
 * saltando esa página por completo. El resto del documento sí se pudo leer
 * sin problema, así que a diferencia de lo que anticipaba el fallback de
 * esta tarea, estos nombres de columna NO son un mock "best effort": son un
 * calco literal del data dictionary real.
 *
 * Enums que el PDF documenta explícitamente en su columna "Description" se
 * modelan acá como union types de TypeScript (ej. `product_type`,
 * `transaction_status`) -- el PDF los describe en prosa ("Type (Deposit,
 * Withdrawal, ...)"), no como un enum de base de datos real, así que estos
 * union types son una interpretación razonable de esa prosa, no una
 * transcripción literal de un tipo SQL.
 *
 * Nota sobre `document_type` en `Customer`: el PDF lista los 5 valores
 * posibles (DNI, CURP, CC, CE, Passport) sin mapear cada uno a un país
 * específico. Este seed asigna CURP a clientes mexicanos, CC a colombianos y
 * DNI a argentinos siguiendo el uso real de esos documentos en cada país --
 * es una decisión de autoría del seed, no un dato que venga del PDF.
 *
 * Patrón de infra (mismo criterio que retrieval-agent, ver
 * `dynamodb-catalog-repository.ts`): esta es la implementación "estática"
 * para este checkpoint. Cuando devops provisione las tablas DynamoDB reales
 * para `customers`/`products`/`transactions` (backend real detrás de un
 * futuro `CORE_BANKING_BACKEND=dynamodb`, análogo a `CATALOG_BACKEND`), ese
 * trabajo es de la fase de Act + infra -- no se implementa acá.
 */

// --- Customers ---------------------------------------------------------

export type DocumentType = "DNI" | "CURP" | "CC" | "CE" | "Passport";
export type Gender = "M" | "F" | "O";
export type Country = "Mexico" | "Colombia" | "Argentina";
export type CustomerSegment = "Premium" | "Plus" | "Basic" | "Student";
export type CustomerStatus = "Active" | "Inactive" | "Suspended" | "Closed";

/** Columnas y tipos calcados de la tabla `Customers [DIMENSION]`, página 4
 * del data dictionary (150,000 filas reales, acá solo 4 filas mock). */
export interface Customer {
  customer_id: string;
  document_number: string;
  document_type: DocumentType;
  first_name: string;
  last_name: string;
  /** DATE en el PDF -- se modela como string ISO `yyyy-mm-dd`. */
  date_of_birth: string;
  gender: Gender;
  email: string;
  mobile_phone: string;
  landline_phone?: string;
  address: string;
  city: string;
  state: string;
  country: Country;
  postal_code?: string;
  detected_accent?: "mexican" | "colombian" | "argentine" | "neutral";
  segment: CustomerSegment;
  /** INTEGER, rango documentado 300-850. */
  credit_score?: number;
  estimated_monthly_income?: number;
  occupation?: string;
  marital_status?: string;
  education_level?: string;
  /** TIMESTAMP en el PDF -- string ISO 8601. */
  registration_date: string;
  registration_branch_id: string;
  customer_status: CustomerStatus;
  last_updated: string;
  accepts_marketing: boolean;
}

// --- Products ------------------------------------------------------------

/**
 * Valores documentados en el PDF para `product_type` (página 5): "Checking
 * Account, Savings Account, Credit Card, Debit Card, Personal Loan,
 * Mortgage, Investment...". El texto extraído del PDF se corta ahí (celda de
 * tabla truncada visualmente en el layout original) -- se listan los 7
 * valores que sí son legibles con certeza; puede haber 1-2 valores
 * adicionales no visibles en la extracción que no se usan en este seed.
 */
export type ProductType =
  | "Checking Account"
  | "Savings Account"
  | "Credit Card"
  | "Debit Card"
  | "Personal Loan"
  | "Mortgage"
  | "Investment";

export type ProductStatus = "Active" | "Blocked" | "Closed" | "Suspended";
export type OpeningChannel = "Branch" | "Web" | "App" | "Call Center";
export type Currency = "MXN" | "COP" | "ARS" | "USD";

/** Helper de dominio: los dos `ProductType` que la fase de Act futura puede
 * "bloquear" en una disputa. No es una columna del PDF -- es una
 * clasificación de conveniencia para este flujo nuevo. */
export const CARD_PRODUCT_TYPES: readonly ProductType[] = ["Credit Card", "Debit Card"];

/** Columnas y tipos calcados de la tabla `Products [DIMENSION]`, página 5. */
export interface Product {
  product_id: string;
  customer_id: string;
  product_type: ProductType;
  product_number: string;
  currency: Currency;
  current_balance: number;
  /** Solo aplica a productos de crédito (tarjeta de crédito, préstamos). */
  credit_limit?: number;
  interest_rate?: number;
  opening_date: string;
  /** Solo aplica a productos a plazo. */
  expiration_date?: string;
  opening_branch_id: string;
  product_status: ProductStatus;
  opening_channel: OpeningChannel;
  has_linked_app: boolean;
  /** Solo aplica a productos de crédito. */
  days_past_due?: number;
  last_transaction_date?: string;
  last_updated: string;
}

// --- Transactions --------------------------------------------------------

/** Documentado en el PDF, página 8: "Type (Deposit, Withdrawal, Transfer,
 * Payment, Purchase, Adjustment)". */
export type TransactionType = "Deposit" | "Withdrawal" | "Transfer" | "Payment" | "Purchase" | "Adjustment";

/** Documentado en el PDF: "Category (Food, Transport, Services,
 * Entertainment, Health, Other)". */
export type TransactionCategory = "Food" | "Transport" | "Services" | "Entertainment" | "Health" | "Other";

/** Documentado en el PDF: "Channel (ATM, Branch, Web, App, POS, Transfer)". */
export type TransactionChannel = "ATM" | "Branch" | "Web" | "App" | "POS" | "Transfer";

/** Documentado en el PDF: "Status (Approved, Declined, Pending, Reversed)". */
export type TransactionStatus = "Approved" | "Declined" | "Pending" | "Reversed";

/** Columnas y tipos calcados de la tabla `Transactions [FACT]`, página 8
 * (5,000,000 filas reales, acá 24 filas mock -- 6 por cliente). */
export interface Transaction {
  transaction_id: string;
  /** TIMESTAMP -- string ISO 8601 con hora. */
  transaction_date: string;
  /** DATE (partition key) -- string ISO `yyyy-mm-dd`. En este seed siempre
   * coincide con la fecha de `transaction_date` (mismo criterio que el EDA
   * documentó para el dataset real: "la partición siempre coincide con
   * process_date"). */
  process_date: string;
  product_id: string;
  customer_id: string;
  transaction_type: TransactionType;
  transaction_category?: TransactionCategory;
  amount: number;
  currency: Currency;
  /** El PDF documenta esta columna, pero el EDA real encontró que
   * `amount_usd` es NULL en el 100% de las filas ya denominadas en USD (ver
   * `EDA_LATAM_Bank_resumen.md`, sección 2). Este seed replica esa
   * particularidad: se deja `undefined` para las transacciones en USD y se
   * completa para el resto, para no ocultar ese hallazgo del EDA real. */
  amount_usd?: number;
  channel: TransactionChannel;
  branch_id?: string;
  /** Solo aplica a compras (`transaction_type === "Purchase"`). */
  merchant_name?: string;
  /** MCC ("Merchant Category Code"). El PDF no fija el formato exacto acá
   * (dice solo "MCC merchant category", VARCHAR(50)) -- un MCC real es un
   * código numérico de 4 dígitos (ISO 18245); este seed usa una etiqueta
   * legible ("Food & Beverage", "Online Retail", etc.) en vez del código
   * numérico crudo, por legibilidad en los tests y en los casos de prueba de
   * disputa. Documentado como decisión de autoría, no como dato verificado.
   */
  merchant_category?: string;
  transaction_country: string;
  transaction_city?: string;
  transaction_status: TransactionStatus;
  response_code?: string;
  is_fraud: boolean;
  /** DECIMAL(5,2), rango documentado 0-100. */
  fraud_score?: number;
  latitude?: number;
  longitude?: number;
}

export const SOURCE_ID = "mock_core_banking_v1";

// --- Seed: 4 clientes --------------------------------------------------

export const CUSTOMERS: readonly Customer[] = [
  {
    customer_id: "CUST-0001",
    document_number: "LOTM900101MDFPRR09",
    document_type: "CURP",
    first_name: "María Fernanda",
    last_name: "López Torres",
    date_of_birth: "1990-01-01",
    gender: "F",
    // Dato de prueba de esta sesión (no un dato real de negocio): apuntado
    // a un inbox real del equipo para poder verificar de punta a punta la
    // entrega real de un código OTP por email (services/auth-agent/src/otp)
    // -- el resto del mock usa @example.com (dominio reservado, nunca
    // entrega). Revertir a un @example.com si esto deja de necesitarse.
    email: "lagg1088@gmail.com",
    mobile_phone: "+52-55-1234-5678",
    address: "Av. Reforma 123, Col. Juárez",
    city: "Ciudad de México",
    state: "CDMX",
    country: "Mexico",
    postal_code: "06600",
    detected_accent: "mexican",
    segment: "Premium",
    credit_score: 745,
    estimated_monthly_income: 45000,
    occupation: "Gerente de Proyecto",
    marital_status: "Married",
    education_level: "Postgraduate",
    registration_date: "2021-03-10T09:00:00Z",
    registration_branch_id: "BR-001",
    customer_status: "Active",
    last_updated: "2026-09-01T00:00:00Z",
    accepts_marketing: true,
  },
  {
    customer_id: "CUST-0002",
    document_number: "1020304050",
    document_type: "CC",
    first_name: "Carlos Andrés",
    last_name: "Restrepo Gómez",
    date_of_birth: "1985-06-15",
    gender: "M",
    email: "carlos.restrepo@example.com",
    mobile_phone: "+57-300-123-4567",
    address: "Cra 43A #10-25",
    city: "Medellín",
    state: "Antioquia",
    country: "Colombia",
    postal_code: "050021",
    detected_accent: "colombian",
    segment: "Plus",
    credit_score: 690,
    estimated_monthly_income: 6500000,
    occupation: "Ingeniero de Software",
    marital_status: "Single",
    education_level: "University",
    registration_date: "2020-07-22T09:00:00Z",
    registration_branch_id: "BR-002",
    customer_status: "Active",
    last_updated: "2026-09-01T00:00:00Z",
    accepts_marketing: false,
  },
  {
    customer_id: "CUST-0003",
    document_number: "34567890",
    document_type: "DNI",
    first_name: "Julieta",
    last_name: "Fernández Acosta",
    date_of_birth: "1993-11-02",
    gender: "F",
    email: "julieta.fernandez@example.com",
    mobile_phone: "+54-11-1234-5678",
    address: "Av. Corrientes 1500",
    city: "Buenos Aires",
    state: "Buenos Aires",
    country: "Argentina",
    postal_code: "C1042",
    detected_accent: "argentine",
    segment: "Basic",
    credit_score: 610,
    estimated_monthly_income: 850000,
    occupation: "Diseñadora Gráfica",
    marital_status: "Single",
    education_level: "University",
    registration_date: "2022-02-14T09:00:00Z",
    registration_branch_id: "BR-003",
    customer_status: "Active",
    last_updated: "2026-09-01T00:00:00Z",
    accepts_marketing: true,
  },
  {
    customer_id: "CUST-0004",
    document_number: "GORS980512HDFMNB03",
    document_type: "CURP",
    first_name: "Roberto",
    last_name: "Gómez Sánchez",
    date_of_birth: "1998-05-12",
    gender: "M",
    email: "roberto.gomez@example.com",
    mobile_phone: "+52-33-9876-5432",
    address: "Calle Hidalgo 45",
    city: "Guadalajara",
    state: "Jalisco",
    country: "Mexico",
    postal_code: "44100",
    detected_accent: "mexican",
    segment: "Student",
    credit_score: 580,
    estimated_monthly_income: 12000,
    occupation: "Estudiante",
    marital_status: "Single",
    education_level: "University",
    registration_date: "2023-08-01T09:00:00Z",
    registration_branch_id: "BR-004",
    customer_status: "Active",
    last_updated: "2026-09-01T00:00:00Z",
    accepts_marketing: true,
  },
] as const;

// --- Seed: productos (al menos una tarjeta por cliente) -------------------

export const PRODUCTS: readonly Product[] = [
  {
    product_id: "PROD-0001",
    customer_id: "CUST-0001",
    product_type: "Credit Card",
    product_number: "4111-XXXX-XXXX-0001",
    currency: "MXN",
    current_balance: -8500.0,
    credit_limit: 60000,
    interest_rate: 42.5,
    opening_date: "2021-03-15",
    opening_branch_id: "BR-001",
    product_status: "Active",
    opening_channel: "Branch",
    has_linked_app: true,
    days_past_due: 0,
    last_transaction_date: "2026-09-22T00:00:00Z",
    last_updated: "2026-09-22T00:00:00Z",
  },
  {
    product_id: "PROD-0002",
    customer_id: "CUST-0001",
    product_type: "Checking Account",
    product_number: "0011-2233-4455",
    currency: "MXN",
    current_balance: 32000.0,
    opening_date: "2021-03-15",
    opening_branch_id: "BR-001",
    product_status: "Active",
    opening_channel: "Branch",
    has_linked_app: true,
    last_transaction_date: "2026-09-18T00:00:00Z",
    last_updated: "2026-09-18T00:00:00Z",
  },
  {
    product_id: "PROD-0003",
    customer_id: "CUST-0002",
    product_type: "Debit Card",
    product_number: "5511-XXXX-XXXX-0003",
    currency: "COP",
    current_balance: 2100000.0,
    opening_date: "2020-08-01",
    opening_branch_id: "BR-002",
    product_status: "Active",
    opening_channel: "Web",
    has_linked_app: true,
    last_transaction_date: "2026-09-21T00:00:00Z",
    last_updated: "2026-09-21T00:00:00Z",
  },
  {
    product_id: "PROD-0004",
    customer_id: "CUST-0003",
    product_type: "Credit Card",
    product_number: "4222-XXXX-XXXX-0004",
    currency: "ARS",
    current_balance: -125000.0,
    credit_limit: 500000,
    interest_rate: 55.0,
    opening_date: "2022-03-01",
    opening_branch_id: "BR-003",
    product_status: "Active",
    opening_channel: "App",
    has_linked_app: true,
    days_past_due: 0,
    last_transaction_date: "2026-09-23T00:00:00Z",
    last_updated: "2026-09-23T00:00:00Z",
  },
  {
    product_id: "PROD-0005",
    customer_id: "CUST-0003",
    product_type: "Savings Account",
    product_number: "0099-8877-6655",
    currency: "ARS",
    current_balance: 300000.0,
    opening_date: "2022-03-01",
    opening_branch_id: "BR-003",
    product_status: "Active",
    opening_channel: "App",
    has_linked_app: true,
    last_transaction_date: "2026-09-24T00:00:00Z",
    last_updated: "2026-09-24T00:00:00Z",
  },
  {
    product_id: "PROD-0006",
    customer_id: "CUST-0004",
    product_type: "Debit Card",
    product_number: "5533-XXXX-XXXX-0006",
    currency: "MXN",
    current_balance: 3200.0,
    opening_date: "2023-08-05",
    opening_branch_id: "BR-004",
    product_status: "Active",
    opening_channel: "App",
    has_linked_app: true,
    last_transaction_date: "2026-09-25T00:00:00Z",
    last_updated: "2026-09-25T00:00:00Z",
  },
] as const;

// --- Seed: transacciones (6 por cliente, fechas recientes a 2026-09-27) ---
//
// Cada cliente tiene transacciones "disputables" (monto claro, comercio
// reconocible, fecha reciente) para casos de prueba tipo "no reconozco un
// cargo de $X en <comercio> del <fecha>". CUST-0001 tiene además una
// transacción con `is_fraud: true` y `fraud_score` alto (compra en el
// extranjero, monto grande) para probar el camino de ESCALATE por sospecha
// de fraude en la fase de Act futura.

export const TRANSACTIONS: readonly Transaction[] = [
  // --- CUST-0001 (María, México) — tarjeta de crédito PROD-0001 ----------
  {
    transaction_id: "TXN-000001",
    transaction_date: "2026-09-20T14:32:00Z",
    process_date: "2026-09-20",
    product_id: "PROD-0001",
    customer_id: "CUST-0001",
    transaction_type: "Purchase",
    transaction_category: "Other",
    amount: 1299.0,
    currency: "MXN",
    channel: "Web",
    merchant_name: "Amazon MX",
    merchant_category: "Online Retail",
    transaction_country: "Mexico",
    transaction_city: "Ciudad de México",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 3.1,
  },
  {
    transaction_id: "TXN-000002",
    transaction_date: "2026-09-22T08:05:00Z",
    process_date: "2026-09-22",
    product_id: "PROD-0001",
    customer_id: "CUST-0001",
    transaction_type: "Purchase",
    transaction_category: "Entertainment",
    amount: 219.0,
    currency: "MXN",
    channel: "Web",
    merchant_name: "Netflix",
    merchant_category: "Streaming",
    transaction_country: "Mexico",
    transaction_city: "Ciudad de México",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.5,
  },
  {
    // Transacción sospechosa: comercio y país distintos a los del cliente,
    // monto alto, marcada explícitamente como fraude -- caso de prueba para
    // el camino de ESCALATE del futuro Lambda de Act.
    transaction_id: "TXN-000003",
    transaction_date: "2026-09-15T23:47:00Z",
    process_date: "2026-09-15",
    product_id: "PROD-0001",
    customer_id: "CUST-0001",
    transaction_type: "Purchase",
    transaction_category: "Other",
    amount: 19200.0,
    currency: "MXN",
    channel: "POS",
    merchant_name: "Electronics Store Miami",
    merchant_category: "Electronics",
    transaction_country: "United States",
    transaction_city: "Miami",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: true,
    fraud_score: 96.0,
  },
  {
    transaction_id: "TXN-000004",
    transaction_date: "2026-09-18T11:00:00Z",
    process_date: "2026-09-18",
    product_id: "PROD-0002",
    customer_id: "CUST-0001",
    transaction_type: "Withdrawal",
    transaction_category: "Other",
    amount: 2000.0,
    currency: "MXN",
    channel: "ATM",
    branch_id: "BR-001",
    transaction_country: "Mexico",
    transaction_city: "Ciudad de México",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 2.0,
  },
  {
    transaction_id: "TXN-000005",
    transaction_date: "2026-09-10T09:15:00Z",
    process_date: "2026-09-10",
    product_id: "PROD-0001",
    customer_id: "CUST-0001",
    transaction_type: "Purchase",
    transaction_category: "Food",
    amount: 145.0,
    currency: "MXN",
    channel: "POS",
    merchant_name: "Starbucks Reforma",
    merchant_category: "Food & Beverage",
    transaction_country: "Mexico",
    transaction_city: "Ciudad de México",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.0,
  },
  {
    transaction_id: "TXN-000006",
    transaction_date: "2026-09-05T19:40:00Z",
    process_date: "2026-09-05",
    product_id: "PROD-0001",
    customer_id: "CUST-0001",
    transaction_type: "Purchase",
    transaction_category: "Transport",
    amount: 89.5,
    currency: "MXN",
    channel: "App",
    merchant_name: "Uber",
    merchant_category: "Transport",
    transaction_country: "Mexico",
    transaction_city: "Ciudad de México",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.2,
  },

  // --- CUST-0002 (Carlos, Colombia) — tarjeta débito PROD-0003 ------------
  {
    transaction_id: "TXN-000007",
    transaction_date: "2026-09-21T13:10:00Z",
    process_date: "2026-09-21",
    product_id: "PROD-0003",
    customer_id: "CUST-0002",
    transaction_type: "Purchase",
    transaction_category: "Food",
    amount: 65000.0,
    currency: "COP",
    channel: "App",
    merchant_name: "Rappi",
    merchant_category: "Food Delivery",
    transaction_country: "Colombia",
    transaction_city: "Medellín",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 2.4,
  },
  {
    transaction_id: "TXN-000008",
    transaction_date: "2026-09-19T17:25:00Z",
    process_date: "2026-09-19",
    product_id: "PROD-0003",
    customer_id: "CUST-0002",
    transaction_type: "Purchase",
    transaction_category: "Other",
    amount: 210000.0,
    currency: "COP",
    channel: "POS",
    merchant_name: "Éxito Medellín",
    merchant_category: "Supermarket",
    transaction_country: "Colombia",
    transaction_city: "Medellín",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.8,
  },
  {
    transaction_id: "TXN-000009",
    transaction_date: "2026-09-14T10:00:00Z",
    process_date: "2026-09-14",
    product_id: "PROD-0003",
    customer_id: "CUST-0002",
    transaction_type: "Purchase",
    transaction_category: "Entertainment",
    amount: 34900.0,
    currency: "COP",
    channel: "Web",
    merchant_name: "Netflix",
    merchant_category: "Streaming",
    transaction_country: "Colombia",
    transaction_city: "Medellín",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.1,
  },
  {
    transaction_id: "TXN-000010",
    transaction_date: "2026-09-12T08:30:00Z",
    process_date: "2026-09-12",
    product_id: "PROD-0003",
    customer_id: "CUST-0002",
    transaction_type: "Payment",
    transaction_category: "Services",
    amount: 120000.0,
    currency: "COP",
    channel: "Web",
    merchant_name: "Claro Colombia",
    merchant_category: "Telecom",
    transaction_country: "Colombia",
    transaction_city: "Medellín",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.0,
  },
  {
    transaction_id: "TXN-000011",
    transaction_date: "2026-09-08T16:45:00Z",
    process_date: "2026-09-08",
    product_id: "PROD-0003",
    customer_id: "CUST-0002",
    transaction_type: "Purchase",
    transaction_category: "Health",
    amount: 45000.0,
    currency: "COP",
    channel: "POS",
    merchant_name: "Farmatodo",
    merchant_category: "Pharmacy",
    transaction_country: "Colombia",
    transaction_city: "Medellín",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.3,
  },
  {
    transaction_id: "TXN-000012",
    transaction_date: "2026-09-02T12:00:00Z",
    process_date: "2026-09-02",
    product_id: "PROD-0003",
    customer_id: "CUST-0002",
    transaction_type: "Withdrawal",
    transaction_category: "Other",
    amount: 100000.0,
    currency: "COP",
    channel: "ATM",
    branch_id: "BR-002",
    transaction_country: "Colombia",
    transaction_city: "Medellín",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 2.0,
  },

  // --- CUST-0003 (Julieta, Argentina) — tarjeta crédito PROD-0004 ---------
  {
    transaction_id: "TXN-000013",
    transaction_date: "2026-09-23T15:20:00Z",
    process_date: "2026-09-23",
    product_id: "PROD-0004",
    customer_id: "CUST-0003",
    transaction_type: "Purchase",
    transaction_category: "Other",
    amount: 45000.0,
    currency: "ARS",
    channel: "Web",
    merchant_name: "Mercado Libre",
    merchant_category: "Online Retail",
    transaction_country: "Argentina",
    transaction_city: "Buenos Aires",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 2.9,
  },
  {
    transaction_id: "TXN-000014",
    transaction_date: "2026-09-17T18:00:00Z",
    process_date: "2026-09-17",
    product_id: "PROD-0004",
    customer_id: "CUST-0003",
    transaction_type: "Purchase",
    transaction_category: "Other",
    amount: 32000.0,
    currency: "ARS",
    channel: "POS",
    merchant_name: "Carrefour Buenos Aires",
    merchant_category: "Supermarket",
    transaction_country: "Argentina",
    transaction_city: "Buenos Aires",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.7,
  },
  {
    transaction_id: "TXN-000015",
    transaction_date: "2026-09-11T20:10:00Z",
    process_date: "2026-09-11",
    product_id: "PROD-0004",
    customer_id: "CUST-0003",
    transaction_type: "Purchase",
    transaction_category: "Services",
    amount: 210000.0,
    currency: "ARS",
    channel: "Web",
    merchant_name: "Despegar.com",
    merchant_category: "Travel",
    transaction_country: "Argentina",
    transaction_city: "Buenos Aires",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 4.2,
  },
  {
    transaction_id: "TXN-000016",
    transaction_date: "2026-09-06T09:00:00Z",
    process_date: "2026-09-06",
    product_id: "PROD-0004",
    customer_id: "CUST-0003",
    transaction_type: "Purchase",
    transaction_category: "Entertainment",
    amount: 5200.0,
    currency: "ARS",
    channel: "Web",
    merchant_name: "Netflix",
    merchant_category: "Streaming",
    transaction_country: "Argentina",
    transaction_city: "Buenos Aires",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.0,
  },
  {
    transaction_id: "TXN-000017",
    transaction_date: "2026-09-24T10:00:00Z",
    process_date: "2026-09-24",
    product_id: "PROD-0005",
    customer_id: "CUST-0003",
    transaction_type: "Deposit",
    transaction_category: "Other",
    amount: 100000.0,
    currency: "ARS",
    channel: "Branch",
    branch_id: "BR-003",
    transaction_country: "Argentina",
    transaction_city: "Buenos Aires",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 0.5,
  },
  {
    transaction_id: "TXN-000018",
    transaction_date: "2026-09-01T07:30:00Z",
    process_date: "2026-09-01",
    product_id: "PROD-0004",
    customer_id: "CUST-0003",
    transaction_type: "Purchase",
    transaction_category: "Transport",
    amount: 18000.0,
    currency: "ARS",
    channel: "POS",
    merchant_name: "YPF",
    merchant_category: "Fuel",
    transaction_country: "Argentina",
    transaction_city: "Buenos Aires",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.4,
  },

  // --- CUST-0004 (Roberto, México, estudiante) — tarjeta débito PROD-0006 -
  {
    transaction_id: "TXN-000019",
    transaction_date: "2026-09-25T13:00:00Z",
    process_date: "2026-09-25",
    product_id: "PROD-0006",
    customer_id: "CUST-0004",
    transaction_type: "Purchase",
    transaction_category: "Food",
    amount: 210.0,
    currency: "MXN",
    channel: "App",
    merchant_name: "Uber Eats",
    merchant_category: "Food Delivery",
    transaction_country: "Mexico",
    transaction_city: "Guadalajara",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.9,
  },
  {
    transaction_id: "TXN-000020",
    transaction_date: "2026-09-20T22:00:00Z",
    process_date: "2026-09-20",
    product_id: "PROD-0006",
    customer_id: "CUST-0004",
    transaction_type: "Purchase",
    transaction_category: "Entertainment",
    amount: 129.0,
    currency: "MXN",
    channel: "Web",
    merchant_name: "Spotify",
    merchant_category: "Streaming",
    transaction_country: "Mexico",
    transaction_city: "Guadalajara",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.0,
  },
  {
    transaction_id: "TXN-000021",
    transaction_date: "2026-09-16T12:30:00Z",
    process_date: "2026-09-16",
    product_id: "PROD-0006",
    customer_id: "CUST-0004",
    transaction_type: "Purchase",
    transaction_category: "Other",
    amount: 85.0,
    currency: "MXN",
    channel: "POS",
    merchant_name: "OXXO Guadalajara",
    merchant_category: "Convenience Store",
    transaction_country: "Mexico",
    transaction_city: "Guadalajara",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.5,
  },
  {
    transaction_id: "TXN-000022",
    transaction_date: "2026-09-09T15:45:00Z",
    process_date: "2026-09-09",
    product_id: "PROD-0006",
    customer_id: "CUST-0004",
    transaction_type: "Purchase",
    transaction_category: "Other",
    amount: 599.0,
    currency: "MXN",
    channel: "Web",
    merchant_name: "Amazon MX",
    merchant_category: "Online Retail",
    transaction_country: "Mexico",
    transaction_city: "Guadalajara",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 2.2,
  },
  {
    transaction_id: "TXN-000023",
    transaction_date: "2026-09-03T09:00:00Z",
    process_date: "2026-09-03",
    product_id: "PROD-0006",
    customer_id: "CUST-0004",
    transaction_type: "Withdrawal",
    transaction_category: "Other",
    amount: 500.0,
    currency: "MXN",
    channel: "ATM",
    branch_id: "BR-004",
    transaction_country: "Mexico",
    transaction_city: "Guadalajara",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.0,
  },
  {
    transaction_id: "TXN-000024",
    transaction_date: "2026-08-28T21:00:00Z",
    process_date: "2026-08-28",
    product_id: "PROD-0006",
    customer_id: "CUST-0004",
    transaction_type: "Purchase",
    transaction_category: "Entertainment",
    amount: 180.0,
    currency: "MXN",
    channel: "POS",
    merchant_name: "Cinepolis",
    merchant_category: "Entertainment",
    transaction_country: "Mexico",
    transaction_city: "Guadalajara",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.6,
  },
  {
    // Fixture de prueba DELIBERADA para el matcher de transacciones
    // ambiguas (services/transaction-agent/src/matching/) -- mismo monto
    // que TXN-000002 (Netflix, 219.0 MXN, 2026-09-22), para que "no
    // reconozco un cargo de 219 pesos" sin nombrar el comercio devuelva 2
    // candidatas reales de María (el propio comentario de
    // compute-dispute.ts ya señalaba este ejemplo -- "los múltiples
    // cargos de Netflix/streaming" -- antes no existía en el mock).
    //
    // Fecha deliberadamente LEJANA de Netflix (3 semanas antes, no un día
    // antes): si quedara pegada a Netflix, NINGUNA señal de fecha
    // (resuelta o no) podría desambiguar -- ambas caerían en cualquier
    // ventana razonable de "la semana pasada". Separadas así, el baseline
    // (que no resuelve fechas, solo premia parejo que el cliente haya
    // mencionado alguna) sigue empatando -- demuestra su límite real --
    // pero el modelo (resolución real de la ventana de fecha vía
    // `resolve-relative-date.ts`) distingue correctamente cuál de las dos
    // cae dentro de "la semana pasada" contada desde el momento del turno.
    transaction_id: "TXN-000025",
    transaction_date: "2026-09-08T20:15:00Z",
    process_date: "2026-09-08",
    product_id: "PROD-0001",
    customer_id: "CUST-0001",
    transaction_type: "Purchase",
    transaction_category: "Entertainment",
    amount: 219.0,
    currency: "MXN",
    channel: "Web",
    merchant_name: "Disney Plus",
    merchant_category: "Streaming",
    transaction_country: "Mexico",
    transaction_city: "Ciudad de México",
    transaction_status: "Approved",
    response_code: "00",
    is_fraud: false,
    fraud_score: 1.4,
  },
] as const;

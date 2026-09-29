# LATAM Bank — raw data profile

| Table | Rows | Files | Schema variants | Exact dup rows | PK dup keys | PK conflicting |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| customers | 150,000 | 1 | 1 | 0 | 0 | 0 |
| products | 400,000 | 1 | 1 | 0 | 0 | 0 |
| branches | 350 | 1 | 1 | 0 | 0 | 0 |
| service_agents | 1,200 | 1 | 1 | 0 | 0 | 0 |
| marketing_campaigns | 200 | 1 | 1 | 0 | 0 | 0 |
| daily_exchange_rates | 13,164 | 1 | 1 | 0 |  |  |
| transactions | 4,425,008 | 1097 | 1 | 0 | 0 | 0 |
| call_center_interactions | 686,296 | 1097 | 1 | 0 | 0 | 0 |
| call_transcripts | 171,321 | 1097 | 1 | 0 | 0 | 0 |
| satisfaction_surveys | 212,759 | 1097 | 1 | 0 | 0 | 0 |
| digital_events | 15,620,994 | 1097 | 1 | 0 | 0 | 0 |
| complaints | 67,095 | 1097 | 1 | 0 | 0 | 0 |
| campaign_sends | 1,746,801 | 1083 | 1 | 0 | 0 | 0 |

## customers

Rows: 150,000 · Files: 1

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| customer_id | VARCHAR | 0.0 | 0.0 | 150,000 | CLI-000RJ6XJD6RO | CLI-ZZZXUEQCAD15 |  |  |
| document_number | VARCHAR | 0.0 | 0.0 | 150,000 | 00000274 | Z9987311 |  |  |
| document_type | VARCHAR | 0.0 | 0.0 | 4 | CC | Pasaporte |  | DNI (104,749); CE (15,150); Pasaporte (15,062); CC (15,039) |
| first_name | VARCHAR | 0.0 | 0.0 | 7,480 | Adriana | Óscar Óscar |  | Gerardo (1,118); Rosa (1,117); Tomás (1,116); Isabella (1,116); Javier (1,107); Beatriz (1,106) |
| last_name | VARCHAR | 0.0 | 0.0 | 3,460 | Acosta Acosta | Álvarez Álvarez |  | García Medina (126); Ramírez Moreno (122); Medina Ortiz (122); Pérez Pérez (121); López Ruiz (121); Moreno Vargas (118) |
| date_of_birth | DATE | 0.0 | 0.0 | 22,956 | 1942-07-07 | 2005-06-21 |  |  |
| gender | VARCHAR | 0.0 | 0.0 | 3 | F | O |  | F (50,508); O (49,808); M (49,684) |
| email | VARCHAR | 1.99 | 0.0 | 91,289 | aacosta@gmail.com | vvera@protonmail.com |  |  |
| mobile_phone | VARCHAR | 3.14 | 0.0 | 145,285 | +54 9 11 1007 6608 | +57 351 999 8744 |  |  |
| landline_phone | VARCHAR | 50.04 | 0.0 | 74,942 | +54 11 1004 2440 | +57 6 999 7506 |  | None (75,053); +57 6 523 8978 (2); +57 6 793 5972 (2); +57 6 992 9035 (2); +57 1 219 4611 (2); +57 6 370 9282 (2) |
| address | VARCHAR | 4.91 | 0.0 | 134,009 | Andador 5 de Mayo 104, Centro | Transversal Transversal 23 #99, Barrio Villa Carolina |  |  |
| city | VARCHAR | 0.0 | 0.0 | 16 | Barranquilla | Tijuana |  | Guadalajara (12,643); Ciudad de México (12,506); Querétaro (12,500); Tijuana (12,489); Puebla (12,400); Monterrey (12,369) |
| state | VARCHAR | 0.0 | 0.0 | 16 | Antioquia | Valle del Cauca |  | Jalisco (12,643); Ciudad de México (12,506); Querétaro (12,500); Baja California (12,489); Puebla (12,400); Nuevo León (12,369) |
| country | VARCHAR | 0.0 | 0.0 | 3 | Argentina | México |  | México (74,907); Colombia (45,251); Argentina (29,842) |
| postal_code | VARCHAR | 10.03 | 0.0 | 8,419 | 01000 | X5000 |  | None (15,044); 44100 (11,413); 22000 (11,260); 76000 (11,238); 01000 (11,226); 72000 (11,152) |
| detected_accent | VARCHAR | 29.88 | 0.0 | 3 | argentine | mexican |  | mexican (52,505); None (44,817); colombian (31,666); argentine (21,012) |
| segment | VARCHAR | 0.0 | 0.0 | 4 | Basic | Student |  | Basic (89,756); Plus (37,547); Premium (15,207); Student (7,490) |
| credit_score | DOUBLE | 14.99 | 0.0 | 400 | 422.0 | 850.0 | 631.00 |  |
| estimated_monthly_income | DOUBLE | 20.02 | 0.0 | 119,734 | 5100.28 | 111895075.15 | 342,974.42 |  |
| occupation | VARCHAR | 10.03 | 0.0 | 20 | Accountant | Technician |  | None (15,039); Manager (6,862); Accountant (6,857); Salesperson (6,823); Homemaker (6,806); Entrepreneur (6,805) |
| marital_status | VARCHAR | 7.97 | 0.0 | 4 | Divorced | Widowed |  | Married (34,765); Divorced (34,734); Single (34,474); Widowed (34,072); None (11,955) |
| education_level | VARCHAR | 11.97 | 0.0 | 5 | College Prep | University |  | College Prep (39,583); High School (33,120); University (32,870); None (17,952); Graduate (13,269); Elementary (13,206) |
| registration_date | TIMESTAMP | 0.0 | 0.0 | 149,947 | 2018-06-18 01:21:11 | 2026-06-17 23:53:29 |  |  |
| registration_branch_id | VARCHAR | 0.0 | 0.0 | 150,000 | SUC-000AQDCT | SUC-ZZZMZ33J |  |  |
| customer_status | VARCHAR | 0.0 | 0.0 | 4 | Active | Suspended |  | Active (127,700); Inactive (14,914); Suspended (4,407); Closed (2,979) |
| last_updated | TIMESTAMP | 0.0 | 0.0 | 149,961 | 2018-06-18 15:09:31 | 2027-06-15 19:35:27 |  |  |
| accepts_marketing | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | False (75,007); True (74,993) |

## products

Rows: 400,000 · Files: 1

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| product_id | VARCHAR | 0.0 | 0.0 | 400,000 | PRD-00017VTLTUMT | PRD-ZZZY0R9XZLOL |  |  |
| customer_id | VARCHAR | 0.0 | 0.0 | 139,578 | CLI-000RJ6XJD6RO | CLI-ZZZXUEQCAD15 |  | CLI-WAE41DS1DNXQ (12); CLI-8JZVX16PH1VZ (11); CLI-L2W15DIELDXD (11); CLI-U0SO73IFO99Z (11); CLI-U2LUDC8SDUI4 (11); CLI-TAJTV74GFYBJ (11) |
| product_type | VARCHAR | 0.0 | 0.0 | 8 | Cuenta Ahorro | Tarjeta Débito |  | Cuenta Ahorro (120,203); Tarjeta Crédito (100,102); Cuenta Corriente (99,979); Tarjeta Débito (39,938); Préstamo Personal (19,960); Préstamo Hipotecario (11,910) |
| product_number | VARCHAR | 0.0 | 0.0 | 399,994 | 0000000154 | POL-9988678 |  |  |
| currency | VARCHAR | 0.0 | 0.0 | 3 | ARS | USD |  | USD (220,501); COP (107,975); ARS (71,524) |
| current_balance | DOUBLE | 0.0 | 0.0 | 359,956 | 0.0 | 881511545.61 | 7,511.25 |  |
| credit_limit | DOUBLE | 68.67 | 0.0 | 124,986 | 1000.33 | 599984205.95 | 93,046.09 |  |
| interest_rate | DOUBLE | 10.02 | 0.0 | 4,443 | 0.0 | 45.0 | 2.20 |  |
| opening_date | DATE | 0.0 | 0.0 | 2,922 | 2018-06-18 | 2026-06-17 |  |  |
| expiration_date | DATE | 66.71 | 0.0 | 3,652 | 2021-06-17 | 2031-06-16 |  |  |
| opening_branch_id | VARCHAR | 0.0 | 0.0 | 350 | SUC-01J639PQ | SUC-ZXOSBE5D |  | SUC-DYPJLQVN (1,235); SUC-552N76DP (1,232); SUC-CUMTPAM3 (1,230); SUC-WH83BE50 (1,227); SUC-KKZOCIP3 (1,223); SUC-RRCPMD2D (1,219) |
| product_status | VARCHAR | 0.0 | 0.0 | 4 | Active | Suspended |  | Active (339,965); Closed (32,039); Blocked (19,935); Suspended (8,061) |
| opening_channel | VARCHAR | 0.0 | 0.0 | 4 | App | Web |  | Branch (199,838); Web (100,282); App (79,726); Call Center (20,154) |
| has_linked_app | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | False (200,142); True (199,858) |
| days_past_due | DOUBLE | 68.66 | 0.0 | 7 | 0.0 | 180.0 | 0.00 | None (274,650); 0.0 (106,585); 90.0 (3,233); 30.0 (3,117); 15.0 (3,114); 60.0 (3,112) |
| last_transaction_date | TIMESTAMP | 23.57 | 0.0 | 305,391 | 2018-06-21 17:07:15 | 2026-06-17 23:17:43 |  |  |
| last_updated | TIMESTAMP | 0.0 | 0.0 | 399,686 | 2018-06-20 05:21:54 | 2027-06-15 02:26:58 |  |  |

## branches

Rows: 350 · Files: 1

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| branch_id | VARCHAR | 0.0 | 0.0 | 350 | SUC-01J639PQ | SUC-ZXOSBE5D |  |  |
| branch_code | VARCHAR | 0.0 | 0.0 | 350 | S0001 | S0350 |  |  |
| branch_name | VARCHAR | 0.0 | 0.0 | 175 | Banco LATAM Barranquilla 179 | Banco LATAM Tijuana Sur |  |  |
| branch_type | VARCHAR | 0.0 | 0.0 | 4 | Corporate | Premium |  | Express (130); Corporate (129); Premium (48); Main (43) |
| address | VARCHAR | 0.0 | 0.0 | 350 | Andador Carranza 480, Centro | Transversal Transversal 23 #968, Barrio El Centro |  |  |
| city | VARCHAR | 0.0 | 0.0 | 16 | Barranquilla | Tijuana |  | Puebla (33); Guadalajara (30); Tijuana (29); Ciudad de México (29); Monterrey (28); Querétaro (26) |
| state | VARCHAR | 0.0 | 0.0 | 16 | Antioquia | Valle del Cauca |  | Puebla (33); Jalisco (30); Baja California (29); Ciudad de México (29); Nuevo León (28); Querétaro (26) |
| country | VARCHAR | 0.0 | 0.0 | 3 | Argentina | México |  | México (175); Colombia (105); Argentina (70) |
| postal_code | VARCHAR | 0.0 | 0.0 | 105 | 01000 | X5000 |  | 72000 (33); 44100 (30); 01000 (29); 22000 (29); 64000 (28); 76000 (26) |
| geographic_zone | VARCHAR | 0.0 | 0.0 | 1 | Urbana | Urbana |  | Urbana (350) |
| phone | VARCHAR | 0.0 | 0.0 | 350 | +54 11 4570 2196 | +57 6 941 8245 |  |  |
| email | VARCHAR | 0.0 | 0.0 | 350 | sucursal0001@bancolatam.com | sucursal0350@bancolatam.com |  |  |
| opening_time | TIME | 0.0 | 0.0 | 4 | 08:00:00 | 09:30:00 |  | 09:30:00 (104); 09:00:00 (89); 08:00:00 (81); 08:30:00 (76) |
| closing_time | TIME | 0.0 | 0.0 | 5 | 17:00:00 | 20:00:00 |  | 17:00:00 (91); 19:00:00 (76); 20:00:00 (68); 18:00:00 (58); 17:30:00 (57) |
| has_atms | BOOLEAN | 0.0 | 0.0 | 1 | true | true |  | True (350) |
| atm_count | BIGINT | 0.0 | 0.0 | 7 | 2 | 8 | 5.00 | 8 (54); 4 (53); 7 (52); 3 (52); 6 (49); 5 (46) |
| has_teller_windows | BOOLEAN | 0.0 | 0.0 | 1 | true | true |  | True (350) |
| teller_window_count | BIGINT | 0.0 | 0.0 | 10 | 3 | 12 | 8.00 | 12 (48); 10 (39); 6 (38); 7 (38); 8 (36); 9 (34) |
| latitude | DOUBLE | 0.0 | 0.0 | 350 | -34.6907666 | 25.7817721 | 0.05 |  |
| longitude | DOUBLE | 0.0 | 0.0 | 350 | -103.4485498 | 0.0999953 | -58.40 |  |
| branch_opening_date | DATE | 0.0 | 0.0 | 346 | 1990-01-03 | 2023-05-11 |  |  |
| branch_status | VARCHAR | 0.0 | 0.0 | 2 | Active | Temporarily Closed |  | Active (336); Temporarily Closed (14) |

## service_agents

Rows: 1,200 · Files: 1

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| agent_id | VARCHAR | 0.0 | 0.0 | 1,200 | AGT-01T1LJ1M61 | AGT-ZZLDFFK5KX |  |  |
| employee_code | VARCHAR | 0.0 | 0.0 | 1,187 | E10271 | E99859 |  |  |
| first_name | VARCHAR | 0.0 | 0.0 | 444 | Adriana | Óscar Samuel |  | Natalia (17); Cristina (17); Manuel (14); Isabella (14); Beatriz (13); Carlos (13) |
| last_name | VARCHAR | 0.0 | 0.0 | 975 | Acosta Cabrera | Álvarez Vega |  |  |
| email | VARCHAR | 0.0 | 0.0 | 1,188 | aacosta@bancohotmail.com | vvega@bancoyahoo.com |  |  |
| phone | VARCHAR | 5.75 | 0.0 | 1,131 | +54 9 11 2895 1050 | +57 351 780 4350 |  |  |
| native_accent | VARCHAR | 0.0 | 0.0 | 3 | argentine | mexican |  | mexican (600); colombian (360); argentine (240) |
| country_of_origin | VARCHAR | 0.0 | 0.0 | 3 | Argentina | Mexico |  | Mexico (600); Colombia (360); Argentina (240) |
| assigned_branch_id | VARCHAR | 30.58 | 0.0 | 833 | SUC-00S8UXXF | SUC-ZZ3671JC |  |  |
| agent_type | VARCHAR | 0.0 | 0.0 | 4 | Digital | Phone |  | Phone (588); Digital (251); In-Person (230); Hybrid (131) |
| experience_level | VARCHAR | 0.0 | 0.0 | 4 | Junior | Specialist |  | Specialist (761); Senior (286); Mid-Senior (135); Junior (18) |
| languages | VARCHAR | 0.0 | 0.0 | 4 | español | español, portugués |  | español (649); español, inglés (422); español, portugués (68); español, inglés, portugués (61) |
| specialty | VARCHAR | 39.67 | 0.0 | 8 | Cobranza | Ventas |  | None (476); Fraudes (105); Cobranza (97); Retención (96); Soporte Técnico (96); Créditos (87) |
| hire_date | DATE | 0.0 | 0.0 | 1,055 | 2013-06-20 | 2026-03-17 |  |  |
| avg_csat | DOUBLE | 11.17 | 0.0 | 149 | 3.5 | 5.0 | 4.27 |  |
| total_monthly_interactions | DOUBLE | 9.25 | 0.0 | 559 | 100.0 | 800.0 | 452.00 |  |
| agent_status | VARCHAR | 0.0 | 0.0 | 4 | Active | Vacation |  | Active (1,090); Vacation (62); Leave (29); Inactive (19) |
| work_shift | VARCHAR | 0.0 | 0.0 | 4 | Afternoon | Rotating |  | Afternoon (418); Morning (398); Rotating (203); Night (181) |

## marketing_campaigns

Rows: 200 · Files: 1

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| campaign_id | VARCHAR | 0.0 | 0.0 | 200 | CMP-06IKIC4I9JS9 | CMP-ZTYZOPJAA5PP |  |  |
| campaign_name | VARCHAR | 0.0 | 0.0 | 200 | CMP_ACQ_CC_Jan2024_0001 | CMP_XSL_SAV_Sep2024_0003 |  |  |
| description | VARCHAR | 19.5 | 0.0 | 37 | Campaña de acquisition para Cuenta Ahorro | Campaña de up-sell para Tarjeta Crédito |  | None (39); Campaña de retention para Tarjeta Crédito (16); Campaña de acquisition para Tarjeta Crédito (11); Campaña de cross-sell para Tarjeta Crédito (11); Campaña de cross-sell para Cuenta Ahorro (10); Campaña de retention para Cuenta Ahorro (10) |
| campaign_type | VARCHAR | 0.0 | 0.0 | 6 | Email | WhatsApp |  | Email (67); SMS (42); WhatsApp (37); Push (24); Mix (21); Voice (9) |
| campaign_objective | VARCHAR | 0.0 | 0.0 | 5 | Acquisition | Up-sell |  | Retention (62); Cross-sell (51); Acquisition (38); Reactivation (25); Up-sell (24) |
| promoted_product | VARCHAR | 11.0 | 0.0 | 7 | Cuenta Ahorro | Tarjeta Crédito |  | Tarjeta Crédito (52); Cuenta Ahorro (40); Préstamo Personal (28); None (22); Inversión (20); Cuenta Corriente (17) |
| target_segment | VARCHAR | 39.5 | 0.0 | 4 | Basic | Student |  | None (79); Plus (32); Premium (32); Basic (30); Student (27) |
| target_country | VARCHAR | 55.5 | 0.0 | 3 | Argentina | Mexico |  | None (111); Colombia (33); Argentina (28); Mexico (28) |
| start_date | DATE | 0.0 | 0.0 | 186 | 2023-07-01 | 2026-06-14 |  |  |
| end_date | DATE | 0.0 | 0.0 | 180 | 2023-08-11 | 2026-08-20 |  |  |
| budget | DOUBLE | 15.5 | 0.0 | 169 | 6355.31 | 499954.38 | 272,363.71 |  |
| campaign_status | VARCHAR | 0.0 | 0.0 | 3 | Active | Paused |  | Completed (172); Paused (25); Active (3) |
| expected_conversion_rate | DOUBLE | 7.0 | 0.0 | 176 | 0.55 | 14.69 | 7.53 |  |

## daily_exchange_rates

Rows: 13,164 · Files: 1

**Duplicates:** `{'exact_duplicate_rows': 0}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| date | DATE | 0.0 | 0.0 | 1,097 | 2023-06-17 | 2026-06-17 |  |  |
| source_currency | VARCHAR | 0.0 | 0.0 | 4 | ARS | USD |  | USD (3,291); MXN (3,291); COP (3,291); ARS (3,291) |
| target_currency | VARCHAR | 0.0 | 0.0 | 4 | ARS | USD |  | USD (3,291); MXN (3,291); COP (3,291); ARS (3,291) |
| exchange_rate | DOUBLE | 0.0 | 0.0 | 9,520 | 0.000245 | 4079.944006 | 5.65 |  |
| buy_rate | DOUBLE | 0.0 | 0.0 | 9,614 | 0.000241 | 4057.98057 | 5.57 |  |
| sell_rate | DOUBLE | 0.0 | 0.0 | 9,636 | 0.000246 | 4138.591967 | 5.67 |  |
| source | VARCHAR | 0.0 | 0.0 | 4 | Bloomberg | Reuters |  | Bloomberg (3,303); Reuters (3,297); Internal (3,293); Central Bank (3,271) |

## transactions

Rows: 4,425,008 · Files: 1097

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

**Temporal:** `{'partition_vs_process_date_mismatch': 0, 'process_date_range': ['2023-06-17', '2026-06-17'], 'lag_days_process_minus_event': [[-1, 1106307], [0, 3318701]]}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| transaction_id | VARCHAR | 0.0 | 0.0 | 4,425,008 | TRX-00009BG2YZ08GS40IPEB | TRX-ZZZZZIX0V5KXSS1Z4AS6 |  |  |
| transaction_date | TIMESTAMP | 0.0 | 0.0 | 4,318,242 | 2023-06-17 06:01:30 | 2026-06-18 05:59:41 |  |  |
| process_date | DATE | 0.0 | 0.0 | 1,097 | 2023-06-17 | 2026-06-17 |  |  |
| product_id | VARCHAR | 0.0 | 0.0 | 339,963 | PRD-00017VTLTUMT | PRD-ZZZY0R9XZLOL |  | PRD-JT87QC1WL9CC (32); PRD-QA20ES22ZTQY (31); PRD-2E0QKUNG21Z3 (31); PRD-4UDDR6I0RCX2 (30); PRD-TOD34PYTSOKK (30); PRD-0D40PGUGBB7P (30) |
| customer_id | VARCHAR | 0.0 | 0.0 | 134,515 | CLI-000RJ6XJD6RO | CLI-ZZZXUEQCAD15 |  | CLI-7MFHXKRUX7NV (150); CLI-AD13IUTW7LEK (148); CLI-L2W15DIELDXD (146); CLI-3O9TPTEH7O8E (145); CLI-V3CA9GOAY6CN (143); CLI-6UE22A0WHIBM (143) |
| transaction_type | VARCHAR | 0.0 | 0.0 | 6 | Adjustment | Withdrawal |  | Purchase (1,083,406); Withdrawal (964,673); Transfer (896,438); Payment (738,964); Deposit (609,409); Adjustment (132,118) |
| transaction_category | VARCHAR | 60.87 | 0.0 | 6 | Entertainment | Transport |  | None (2,693,520); Food (432,468); Services (345,370); Other (260,518); Transport (260,316); Entertainment (259,643) |
| amount | DOUBLE | 0.0 | 0.0 | 2,570,875 | 5.0 | 39999828.48 | 5,398.23 |  |
| currency | VARCHAR | 0.0 | 0.0 | 3 | ARS | USD |  | USD (2,437,979); COP (1,194,444); ARS (792,585) |
| amount_usd | DOUBLE | 57.34 | 0.0 | 528,859 | 5.0 | 9999.96 | 466.69 |  |
| channel | VARCHAR | 0.0 | 0.0 | 6 | ATM | Web |  | POS (1,548,161); ATM (1,328,334); Web (663,445); App (663,414); Branch (132,495); Transfer (89,159) |
| branch_id | VARCHAR | 68.63 | 0.0 | 350 | SUC-01J639PQ | SUC-ZXOSBE5D |  | None (3,037,076); SUC-8AM4U1NU (4,177); SUC-2ATW7QMQ (4,153); SUC-DYPJLQVN (4,141); SUC-8433QXQ4 (4,120); SUC-Z39EOE70 (4,116) |
| merchant_name | VARCHAR | 76.74 | 0.0 | 24 | Boutique Moda | Óptica Visión |  | None (3,395,774); Super Ahorro (64,527); Restaurante El Buen Sabor (64,370); Tienda Don José (64,249); Mercado Central (63,912); Empresa Telefónica (51,464) |
| merchant_category | VARCHAR | 76.75 | 0.0 | 6 | Entertainment | Transport |  | None (3,396,215); Food (256,846); Services (205,124); Other (155,029); Transport (154,931); Entertainment (153,960) |
| transaction_country | VARCHAR | 0.0 | 0.0 | 7 | Argentina | USA |  | México (2,105,794); Colombia (1,289,503); Argentina (867,561); USA (40,621); Spain (40,542); Mexico (40,515) |
| transaction_city | VARCHAR | 10.0 | 0.0 | 28 | Barcelona | Valencia |  | None (442,611); Guadalajara (325,400); Monterrey (324,589); Puebla (324,411); Ciudad de México (322,079); Tijuana (317,942) |
| transaction_status | VARCHAR | 0.0 | 0.0 | 4 | Approved | Reversed |  | Approved (4,070,681); Declined (221,234); Pending (88,343); Reversed (44,750) |
| response_code | VARCHAR | 5.0 | 0.0 | 5 | 00 | 54 |  | 00 (3,867,312); None (221,033); 14 (84,472); 51 (84,179); 05 (84,141); 54 (83,871) |
| is_fraud | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | False (4,420,692); True (4,316) |
| fraud_score | DOUBLE | 20.0 | 0.0 | 5,014 | 0.0 | 99.99 | 15.01 |  |
| latitude | DOUBLE | 80.63 | 0.0 | 850,555 | -35.6036984 | 5.7109985 | 0.20 |  |
| longitude | DOUBLE | 80.63 | 0.0 | 850,492 | -75.0720969 | 0.99999 | -1.00 |  |

## call_center_interactions

Rows: 686,296 · Files: 1097

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

**Temporal:** `{'partition_vs_process_date_mismatch': 0, 'process_date_range': ['2023-06-17', '2026-06-17'], 'lag_days_process_minus_event': [[-1, 228318], [0, 457978]]}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| interaction_id | VARCHAR | 0.0 | 0.0 | 686,296 | INT-0003AGRO12D5GXCQ | INT-ZZZU7MBRJKC6QE8F |  |  |
| interaction_date | TIMESTAMP | 0.0 | 0.0 | 683,625 | 2023-06-17 08:03:26 | 2026-06-18 07:58:13 |  |  |
| process_date | DATE | 0.0 | 0.0 | 1,097 | 2023-06-17 | 2026-06-17 |  |  |
| customer_id | VARCHAR | 0.0 | 0.0 | 148,443 | CLI-000RJ6XJD6RO | CLI-ZZZXUEQCAD15 |  | CLI-X0XITE68B632 (18); CLI-A10JMPFFM6KM (17); CLI-9C2E50SNML32 (16); CLI-W09AWNPDRDQ2 (15); CLI-ZTUGJA50KQKQ (15); CLI-IT9U2X3ULFH0 (15) |
| agent_id | VARCHAR | 0.0 | 0.0 | 1,090 | AGT-01T1LJ1M61 | AGT-ZZLDFFK5KX |  | AGT-N0HJHS1DBA (707); AGT-I0RSC4IGXZ (707); AGT-67FCNFADT1 (707); AGT-95LE7E26SA (705); AGT-IEP2JM9BI7 (701); AGT-T6G3XMAHRJ (700) |
| interaction_type | VARCHAR | 0.0 | 0.0 | 5 | Chat | Video |  | Inbound Call (480,678); Outbound Call (102,572); Chat (68,691); Email (27,543); Video (6,812) |
| channel | VARCHAR | 0.0 | 0.0 | 6 | App | WhatsApp |  | Phone (583,250); Email (27,543); App (26,364); WhatsApp (22,888); Web Chat (22,856); Web (3,395) |
| contact_reason | VARCHAR | 0.0 | 0.0 | 6 | Comercial | Técnico |  | Transaccional (240,056); Producto (150,863); Queja (117,021); Técnico (102,899); Comercial (54,879); Retención (20,578) |
| reason_category | VARCHAR | 0.0 | 0.0 | 6 | Comercial | Técnico |  | Transaccional (240,056); Producto (150,863); Queja (117,021); Técnico (102,899); Comercial (54,879); Retención (20,578) |
| duration_seconds | DOUBLE | 14.02 | 0.0 | 1,049 | 30.0 | 1204.0 | 291.00 |  |
| wait_time_seconds | DOUBLE | 29.96 | 0.0 | 370 | 0.0 | 424.0 | 119.00 |  |
| was_resolved | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | True (526,030); False (160,266) |
| requires_followup | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | False (447,242); True (239,054) |
| detected_sentiment | VARCHAR | 0.0 | 0.0 | 5 | Muy Negativo | Positivo |  | Neutral (459,712); Negativo (94,322); Positivo (75,562); Muy Negativo (37,727); Muy Positivo (18,973) |
| sentiment_score | DOUBLE | 0.0 | 0.0 | 201 | -1.0 | 1.0 | -0.02 |  |
| customer_detected_accent | VARCHAR | 29.83 | 0.0 | 3 | argentine | mexican |  | mexican (240,674); None (204,750); colombian (144,712); argentine (96,160) |
| agent_used_accent | VARCHAR | 29.83 | 0.0 | 3 | argentine | mexican |  | mexican (241,931); None (204,750); colombian (144,386); argentine (95,229) |
| was_escalated | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | False (617,910); True (68,386) |
| mentioned_products | VARCHAR | 60.03 | 0.0 | 274,341 | PRD-0005DIQRMTH4 | PRD-ZZZQ7R8B41TS,PRD-L1EV04RXIILX |  | None (411,955); PRD-43CB0LTMZEQR,PRD-4UPDPP4SJ1IJ,PRD-ZNM8XQYUBZ6C (1); PRD-GG5BDE9ADFDY,PRD-IW6O3N8IRVUS,PRD-VM9QORXLPSGP (1); PRD-4NE0D001AZX4,PRD-8ZDNYV9SIS30 (1); PRD-R43K3RBIZ9SL (1); PRD-Q4NXA8RTZ3EX (1) |
| has_transcript | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | False (514,975); True (171,321) |
| has_recording | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | True (590,062); False (96,234) |

## call_transcripts

Rows: 171,321 · Files: 1097

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

**Temporal:** `{'partition_vs_process_date_mismatch': 0, 'process_date_range': ['2023-06-17', '2026-06-17']}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| transcript_id | VARCHAR | 0.0 | 0.0 | 171,321 | TRS-0008H44LYDZTV83G1X2Y | TRS-ZZZF7HLJT8J19PA7NZDW |  |  |
| interaction_id | VARCHAR | 0.0 | 0.0 | 171,321 | INT-0003AGRO12D5GXCQ | INT-ZZZU7MBRJKC6QE8F |  |  |
| process_date | DATE | 0.0 | 0.0 | 1,097 | 2023-06-17 | 2026-06-17 |  |  |
| customer_id | VARCHAR | 0.0 | 0.0 | 101,951 | CLI-000RJ6XJD6RO | CLI-ZZZ1R5ESNNMY |  |  |
| agent_id | VARCHAR | 0.0 | 0.0 | 1,090 | AGT-01T1LJ1M61 | AGT-ZZLDFFK5KX |  | AGT-1HI8LTU9QQ (203); AGT-N2UN9U0TIY (194); AGT-K2ZF1JO9HT (194); AGT-4W61FITOXQ (193); AGT-KWSHPLRIGG (192); AGT-ECV5AJ8IMB (192) |
| full_text | VARCHAR | 0.0 | 0.0 | 546 | Cliente: Buenas tardes, necesito consultar el saldo de mi ta | Cliente: Hola, buenos días. Quisiera saber cuál es mi saldo  |  | Cliente: Buenas tardes, necesito consultar el saldo de mi ta (51,555); Cliente: Hola, buenos días. Quisiera saber cuál es mi saldo  (51,189); Cliente: Buenas tardes, necesito consultar el saldo de mi ta (1,133); Cliente: Buenas tardes, necesito consultar el saldo de mi ta (1,123); Cliente: Buenas tardes, necesito consultar el saldo de mi ta (1,116); Cliente: Hola, buenos días. Quisiera saber cuál es mi saldo  (1,112) |
| customer_text | VARCHAR | 0.0 | 0.0 | 42 | Buenas tardes, necesito consultar el saldo de mi tarjeta de  | Hola, buenos días. Quisiera saber cuál es mi saldo actual en |  | Buenas tardes, necesito consultar el saldo de mi tarjeta de  (51,555); Hola, buenos días. Quisiera saber cuál es mi saldo actual en (51,189); Buenas tardes, necesito consultar el saldo de mi tarjeta de  (4,393); Hola, buenos días. Quisiera saber cuál es mi saldo actual en (4,365); Buenas tardes, necesito consultar el saldo de mi tarjeta de  (4,328); Hola, buenos días. Quisiera saber cuál es mi saldo actual en (4,315) |
| agent_text | VARCHAR | 0.0 | 0.0 | 42 | Buenas tardes, claro que sí. Déjeme revisar esa información. | Buenos días, con gusto le ayudo. Permítame un momento para v |  | Buenas tardes, claro que sí. Déjeme revisar esa información. (51,555); Buenos días, con gusto le ayudo. Permítame un momento para v (51,189); Buenas tardes, claro que sí. Déjeme revisar esa información. (4,365); Buenas tardes, claro que sí. Déjeme revisar esa información. (4,329); Buenos días, con gusto le ayudo. Permítame un momento para v (4,282); Buenos días, con gusto le ayudo. Permítame un momento para v (4,278) |
| detected_language | VARCHAR | 0.0 | 0.0 | 1 | es | es |  | es (171,321) |
| detected_accent | VARCHAR | 36.82 | 0.0 | 3 | argentine | mexican |  | None (63,083); mexican (54,152); colombian (32,284); argentine (21,802) |
| accent_confidence | DOUBLE | 10.01 | 0.0 | 25 | 0.75 | 0.99 | 0.87 | None (17,141); 0.83 (6,586); 0.85 (6,568); 0.97 (6,558); 0.94 (6,534); 0.98 (6,533) |
| detected_keywords | VARCHAR | 5.13 | 0.0 | 12 | banco, cuenta | servicio, cuenta, banco |  | banco, servicio, cuenta (18,173); cuenta, servicio, banco (18,116); cuenta, banco, servicio (18,113); servicio, cuenta, banco (18,016); servicio, banco, cuenta (18,016); banco, cuenta, servicio (17,910) |
| mentioned_entities | VARCHAR | 10.02 | 0.0 | 54 | {"account_numbers": 0, "dates": 0, "amounts": 0, "products": | {"account_numbers": 2, "dates": 1, "amounts": 2, "products": |  | None (17,164); {"account_numbers": 2, "dates": 1, "amounts": 1, "products": (2,971); {"account_numbers": 0, "dates": 0, "amounts": 0, "products": (2,947); {"account_numbers": 2, "dates": 1, "amounts": 2, "products": (2,930); {"account_numbers": 1, "dates": 1, "amounts": 1, "products": (2,923); {"account_numbers": 0, "dates": 1, "amounts": 2, "products": (2,918) |
| detected_intents | VARCHAR | 4.94 | 0.0 | 1 | consulta_general | consulta_general |  | consulta_general (162,864); None (8,457) |
| main_topics | VARCHAR | 0.0 | 0.0 | 6 | Comercial | Técnico |  | Transaccional (59,786); Producto (37,658); Queja (29,198); Técnico (25,691); Comercial (13,808); Retención (5,180) |
| transcription_model | VARCHAR | 0.0 | 0.0 | 4 | AWS Transcribe | Whisper v3 |  | AWS Transcribe (43,117); Whisper v3 (42,803); Google STT (42,740); Azure Speech (42,661) |
| audio_quality | VARCHAR | 5.04 | 0.0 | 3 | High | Medium |  | High (114,371); Medium (40,350); None (8,638); Low (7,962) |
| duration_seconds | DOUBLE | 14.03 | 0.0 | 973 | 30.0 | 1151.0 | 290.00 |  |

## satisfaction_surveys

Rows: 212,759 · Files: 1097

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

**Temporal:** `{'partition_vs_process_date_mismatch': 0, 'process_date_range': ['2023-06-17', '2026-06-17'], 'lag_days_process_minus_event': [[-2, 12241], [-1, 156851], [0, 43667]]}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| survey_id | VARCHAR | 0.0 | 0.0 | 212,759 | SRV-000056NJ558MNADQ0EZK | SRV-ZZZUVHJDIG5NY6DIKAF2 |  |  |
| survey_date | TIMESTAMP | 0.0 | 0.0 | 212,505 | 2023-06-17 09:29:20 | 2026-06-19 06:54:58 |  |  |
| process_date | DATE | 0.0 | 0.0 | 1,097 | 2023-06-17 | 2026-06-17 |  |  |
| interaction_id | VARCHAR | 0.0 | 0.0 | 212,759 | INT-000MUYBH4CTIWLVP | INT-ZZZLO5R8FWTJRVIG |  |  |
| customer_id | VARCHAR | 0.0 | 0.0 | 113,640 | CLI-000W7FWO8212 | CLI-ZZZXUEQCAD15 |  |  |
| agent_id | VARCHAR | 0.0 | 0.0 | 1,090 | AGT-01T1LJ1M61 | AGT-ZZLDFFK5KX |  | AGT-4XB5JSV7Y6 (243); AGT-R5961LOEMU (242); AGT-71SU0OSLVY (239); AGT-8FD0HKHTXZ (237); AGT-9G892RO3CJ (236); AGT-QYLO3MENQW (235) |
| survey_type | VARCHAR | 0.0 | 0.0 | 3 | CES | NPS |  | CSAT (127,856); NPS (63,668); CES (21,235) |
| send_channel | VARCHAR | 0.0 | 0.0 | 5 | App | Web |  | Email (84,880); SMS (63,798); App (42,595); IVR (10,836); Web (10,650) |
| main_score | BIGINT | 0.0 | 0.0 | 7 | 1 | 7 | 3.00 | 3 (90,363); 2 (46,398); 4 (21,805); 5 (16,475); 6 (16,329); 7 (16,230) |
| nps_category | VARCHAR | 71.61 | 0.0 | 2 | Detractor | Passive |  | None (152,365); Detractor (45,007); Passive (15,387) |
| question_1_text | VARCHAR | 42.99 | 0.0 | 3 | ¿Cómo calificaría la atención brindada? | ¿Qué tan satisfecho está con el servicio recibido? |  | None (91,456); ¿Cómo calificaría la atención brindada? (40,667); ¿El agente resolvió su consulta satisfactoriamente? (40,489); ¿Qué tan satisfecho está con el servicio recibido? (40,147) |
| question_1_response | DOUBLE | 42.95 | 0.0 | 5 | 1.0 | 5.0 | 3.00 | None (91,389); 5.0 (24,575); 3.0 (24,314); 2.0 (24,217); 4.0 (24,211); 1.0 (24,053) |
| question_2_text | VARCHAR | 61.75 | 0.0 | 1 | ¿El tiempo de espera fue aceptable? | ¿El tiempo de espera fue aceptable? |  | None (131,388); ¿El tiempo de espera fue aceptable? (81,371) |
| question_2_response | DOUBLE | 61.7 | 0.0 | 5 | 1.0 | 5.0 | 3.00 | None (131,263); 3.0 (16,567); 4.0 (16,473); 2.0 (16,217); 5.0 (16,191); 1.0 (16,048) |
| question_3_text | VARCHAR | 81.13 | 0.0 | 1 | ¿Volvería a contactarnos por este canal? | ¿Volvería a contactarnos por este canal? |  | None (172,615); ¿Volvería a contactarnos por este canal? (40,144) |
| question_3_response | DOUBLE | 81.15 | 0.0 | 5 | 1.0 | 5.0 | 3.00 | None (172,656); 1.0 (8,176); 4.0 (8,097); 3.0 (8,030); 2.0 (7,954); 5.0 (7,846) |
| open_comments | VARCHAR | 52.44 | 0.0 | 13 | Aceptable. | Tuve que esperar demasiado tiempo. |  | None (111,563); Tardaron mucho en atenderme. (13,620); No resolvieron mi problema completamente. (13,546); Tuve que esperar demasiado tiempo. (13,501); No estoy satisfecho con la solución. (13,472); El agente no fue muy claro en sus explicaciones. (13,338) |
| comment_sentiment | VARCHAR | 52.41 | 0.0 | 3 | Negative | Positive |  | None (111,502); Negative (67,529); Neutral (26,774); Positive (6,954) |
| response_time_hours | DOUBLE | 0.0 | 0.0 | 3,473 | 1.01 | 35.97 | 18.46 |  |
| campaign_response_rate | DOUBLE | 15.06 | 0.0 | 3,001 | 15.0 | 45.0 | 29.95 |  |

## digital_events

Rows: 15,620,994 · Files: 1097

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

**Temporal:** `{'partition_vs_process_date_mismatch': 0, 'process_date_range': ['2023-06-17', '2026-06-17'], 'lag_days_process_minus_event': [[-1, 3930816], [0, 11690178]]}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| event_id | VARCHAR | 0.0 | 0.0 | 15,620,994 | EVT-00004OPNGBI2S1FVLZNQ | EVT-ZZZZZCGN3IJZCCBMK3RN |  |  |
| event_date | TIMESTAMP | 0.0 | 0.0 | 14,217,807 | 2023-06-17 06:02:03 | 2026-06-18 06:04:05 |  |  |
| process_date | DATE | 0.0 | 0.0 | 1,097 | 2023-06-17 | 2026-06-17 |  |  |
| customer_id | VARCHAR | 23.98 | 0.0 | 149,997 | CLI-000RJ6XJD6RO | CLI-ZZZXUEQCAD15 |  | None (3,745,446); CLI-5ZWHISS8X4SJ (238); CLI-OL4FCCBH0FJ2 (237); CLI-L3IDRAZT24B8 (229); CLI-4BT6B9ODFT1P (219); CLI-JVGVYPC5RVXD (218) |
| session_id | VARCHAR | 0.0 | 0.0 | 1,837,415 | SES-0000RGEWB3Y8C3D5RP2KT78J4QZD | SES-ZZZZLZZVF3Z133H1LVIX5S3IIQ8K |  | SES-YUJOFTPKIZYNK7NN23N5RGS1XMFE (15); SES-VPKJI6AQKE6H04V0BN9W4LBJ1B6O (15); SES-HYMBW5X2UNZ0CIU331H5E51YU4RY (15); SES-MCXR66MY266IDJYPBNUHW7L5N6OL (15); SES-RMDH3UZ7LBYW0YK1RU7E3IQ5CD3O (15); SES-VYKK58Y38H2QV146TNFB7RZW2UBM (15) |
| event_type | VARCHAR | 0.0 | 0.0 | 7 | Click | Purchase |  | PageView (5,972,564); Click (3,585,034); Login (2,434,770); Logout (2,433,612); FormSubmit (596,908); Error (358,723) |
| event_category | VARCHAR | 0.0 | 0.0 | 4 | Authentication | Transaction |  | Authentication (4,868,382); Navigation (3,961,324); Product (3,786,314); Transaction (3,004,974) |
| channel | VARCHAR | 0.0 | 0.0 | 4 | Android App | iOS App |  | Android App (5,476,164); iOS App (3,899,497); Desktop Web (3,128,851); Mobile Web (3,116,482) |
| platform | VARCHAR | 5.0 | 0.0 | 5 | Android | iOS |  | Android (6,685,963); iOS (5,182,421); Windows (991,807); Linux (991,774); MacOS (988,502); None (780,527) |
| browser | VARCHAR | 62.02 | 0.0 | 5 | Chrome | Samsung Internet |  | None (9,687,736); Safari (1,728,968); Chrome (1,725,978); Samsung Internet (990,164); Firefox (744,247); Edge (743,901) |
| app_version | VARCHAR | 42.98 | 0.0 | 500 | 1.0.0 | 5.9.9 |  | None (6,714,416); 2.6.5 (19,050); 2.6.0 (18,939); 2.5.9 (18,924); 1.3.9 (18,892); 1.8.2 (18,842) |
| page_url | VARCHAR | 5.0 | 0.0 | 12 | /accounts | /transfer |  | /login (2,312,677); /logout (2,312,586); /products/loans (1,199,796); /products/savings (1,198,797); /products/credit-card (1,198,674); /payments (952,561) |
| page_title | VARCHAR | 4.99 | 0.0 | 12 | Ayuda | Transferir |  | Cerrar Sesión (2,312,841); Iniciar Sesión (2,312,796); Préstamos (1,199,615); Cuenta de Ahorro (1,198,585); Tarjeta de Crédito (1,198,485); Pagar Servicios (952,401) |
| action | VARCHAR | 10.0 | 0.0 | 10 | initiate_payment | view_transactions |  | view_product (3,407,643); logout (2,191,640); login (2,189,929); None (1,561,432); initiate_payment (902,225); initiate_transfer (901,824) |
| element_id | VARCHAR | 15.0 | 0.0 | 12 | accounts_page | transfer_form |  | None (2,343,244); login_form (2,070,024); logout_btn (2,069,557); loans_product (1,073,762); cc_product (1,072,404); savings_product (1,071,672) |
| product_id | VARCHAR | 90.78 | 0.0 | 389,087 | PRD-00017VTLTUMT | PRD-ZZZY0R9XZLOL |  | None (14,180,656); PRD-ZRJYJMFVP0XK (16); PRD-0KZL05WVV3S7 (16); PRD-5PHCS69KO5FP (14); PRD-V4KUTEW44KI3 (14); PRD-NWCSW2AH6ZYY (14) |
| event_value | DOUBLE | 94.91 | 0.0 | 397,337 | 10.01 | 4999.98 | 2,507.07 |  |
| duration_seconds | DOUBLE | 63.67 | 0.0 | 296 | 5.0 | 300.0 | 153.00 |  |
| ip_address | VARCHAR | 5.0 | 0.0 | 1,836,678 | 1.0.106.193 | 99.99.95.147 |  | None (780,855); 159.33.35.111 (29); 35.239.221.62 (29); 194.106.101.90 (28); 186.101.192.224 (28); 94.202.38.84 (28) |
| ip_country | VARCHAR | 0.0 | 0.0 | 4 | Argentina | México |  | México (6,242,893); Colombia (4,806,882); Argentina (3,533,045); Mexico (1,038,174) |
| ip_city | VARCHAR | 27.98 | 0.0 | 16 | Barranquilla | Tijuana |  | None (4,370,476); Guadalajara (951,621); Querétaro (938,075); Tijuana (935,526); Puebla (934,034); Ciudad de México (930,004) |
| is_mobile | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | True (12,492,143); False (3,128,851) |
| referrer | VARCHAR | 93.29 | 0.0 | 4 | https://email.marketing.com | https://www.instagram.com |  | None (14,573,469); https://www.instagram.com (262,214); https://email.marketing.com (262,107); https://www.google.com (261,610); https://www.facebook.com (261,594) |
| utm_source | VARCHAR | 94.63 | 0.0 | 4 | direct | google |  | None (14,781,949); email (210,149); direct (209,721); google (209,669); facebook (209,506) |
| utm_medium | VARCHAR | 94.63 | 0.0 | 4 | cpc | social |  | None (14,781,860); organic (210,210); email (209,778); social (209,627); cpc (209,519) |
| utm_campaign | VARCHAR | 94.63 | 0.0 | 3 | new_users | spring_promo |  | None (14,782,077); retention (280,033); spring_promo (279,962); new_users (278,922) |

## complaints

Rows: 67,095 · Files: 1097

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

**Temporal:** `{'partition_vs_process_date_mismatch': 0, 'process_date_range': ['2023-06-17', '2026-06-17'], 'lag_days_process_minus_event': [[-1, 22585], [0, 44510]]}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| complaint_id | VARCHAR | 0.0 | 0.0 | 67,095 | CMP-000P3Q3VK8DRP89MGDT8 | CMP-ZZZPZU433LQ6WX0FTD9Y |  |  |
| creation_date | TIMESTAMP | 0.0 | 0.0 | 67,074 | 2023-06-17 08:07:05 | 2026-06-18 07:56:52 |  |  |
| process_date | DATE | 0.0 | 0.0 | 1,097 | 2023-06-17 | 2026-06-17 |  |  |
| customer_id | VARCHAR | 0.0 | 0.0 | 54,145 | CLI-0011WR7BFJZ8 | CLI-ZZZXUEQCAD15 |  |  |
| case_type | VARCHAR | 0.0 | 0.0 | 4 | Claim | Suggestion |  | Complaint (40,452); Claim (16,598); Request (6,761); Suggestion (3,284) |
| category | VARCHAR | 0.0 | 0.0 | 5 | Branch | Transactions |  | Transactions (13,580); Fees (13,553); Technical (13,407); Branch (13,361); Service (13,194) |
| subcategory | VARCHAR | 9.98 | 0.0 | 5 | Atención en sucursal | Problema con app |  | Cargo no reconocido (12,297); Cobro indebido (12,194); Problema con app (12,128); Atención en sucursal (11,892); Calidad de servicio (11,886); None (6,698) |
| reception_channel | VARCHAR | 0.0 | 0.0 | 6 | App | Web |  | Call Center (33,761); Email (13,323); Web (9,884); App (6,727); Branch (2,683); Regulator (717) |
| affected_product_id | VARCHAR | 33.57 | 0.0 | 42,184 | PRD-00017VTLTUMT | PRD-ZZXU6YE611TV |  |  |
| related_branch_id | VARCHAR | 71.42 | 0.0 | 350 | SUC-01J639PQ | SUC-ZXOSBE5D |  | None (47,917); SUC-FQBLIDK9 (76); SUC-85YWBJ74 (76); SUC-I7CB5PA8 (75); SUC-SCFDICUT (71); SUC-LBPQUZ4D (71) |
| origin_interaction_id | VARCHAR | 100.0 | 0.0 | 0 |  |  |  | None (67,095) |
| description | VARCHAR | 0.0 | 0.0 | 5 | Queja relacionada con branch | Queja relacionada con transactions |  | Queja relacionada con transactions (13,580); Queja relacionada con fees (13,553); Queja relacionada con technical (13,407); Queja relacionada con branch (13,361); Queja relacionada con service (13,194) |
| claimed_amount | DOUBLE | 67.58 | 0.0 | 21,303 | 50.27 | 4999.93 | 2,533.08 |  |
| currency | VARCHAR | 67.54 | 0.0 | 4 | ARS | USD |  | None (45,319); MXN (5,487); COP (5,456); USD (5,431); ARS (5,402) |
| priority | VARCHAR | 0.0 | 0.0 | 4 | Critical | Medium |  | Medium (33,439); Low (20,411); High (9,890); Critical (3,355) |
| status | VARCHAR | 0.0 | 0.0 | 6 | Closed | Resolved |  | In Process (26,823); Open (20,125); Resolved (13,512); Escalated (3,321); Closed (2,609); Rejected (705) |
| assigned_agent_id | VARCHAR | 34.45 | 0.0 | 1,200 | AGT-01T1LJ1M61 | AGT-ZZLDFFK5KX |  | None (23,115); AGT-RZ4O8DO2E0 (61); AGT-EMSDKX98GM (59); AGT-VJR3NWJ0XO (58); AGT-VIHAWCYHY3 (57); AGT-5PP7O7ZE96 (55) |
| assignment_date | TIMESTAMP | 34.47 | 0.0 | 43,955 | 2023-06-17 22:26:12 | 2026-06-19 03:56:52 |  |  |
| first_response_date | TIMESTAMP | 39.11 | 0.0 | 40,847 | 2023-06-18 03:37:40 | 2026-06-20 22:42:19 |  |  |
| resolution_date | TIMESTAMP | 77.12 | 0.0 | 15,348 | 2023-06-20 07:10:42 | 2026-07-18 06:07:57 |  |  |
| closing_date | TIMESTAMP | 96.3 | 0.0 | 2,480 | 2023-06-26 11:38:44 | 2026-07-18 22:15:16 |  |  |
| sla_breached | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | False (53,600); True (13,495) |
| resolution_days | DOUBLE | 77.1 | 0.0 | 30 | 1.0 | 30.0 | 16.00 | None (51,732); 9.0 (551); 25.0 (547); 24.0 (539); 28.0 (539); 30.0 (539) |
| resolution | VARCHAR | 77.18 | 0.0 | 5 | Se brindó explicación detallada al cliente y se resolvió la  | Se verificó la información y se procedió con la corrección s |  | None (51,785); Se revisó el caso y se realizó el ajuste correspondiente en  (3,132); Se escaló a área correspondiente y se aplicó la solución def (3,098); Se brindó explicación detallada al cliente y se resolvió la  (3,078); Se otorgó compensación al cliente por las molestias ocasiona (3,034); Se verificó la información y se procedió con la corrección s (2,968) |
| compensation_granted | DOUBLE | 93.08 | 0.0 | 4,436 | 10.15 | 499.98 | 252.59 |  |
| resolution_satisfaction | DOUBLE | 96.3 | 0.0 | 5 | 1.0 | 5.0 | 3.00 | None (64,611); 5.0 (526); 3.0 (514); 1.0 (500); 4.0 (472); 2.0 (472) |
| is_repeat_complainer | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | False (57,009); True (10,086) |

## campaign_sends

Rows: 1,746,801 · Files: 1083

**Duplicates:** `{'exact_duplicate_rows': 0, 'pk_extra_rows': 0, 'pk_keys_duplicated': 0, 'pk_keys_with_conflicting_values': 0, 'pk_null': 0}`

**Temporal:** `{'partition_vs_process_date_mismatch': 0, 'process_date_range': ['2023-07-01', '2026-06-17'], 'lag_days_process_minus_event': [[-1, 436429], [0, 1310372]]}`

| Column | Type | Null % | Empty % | Distinct | Min | Max | p50 | Top values |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- |
| send_id | VARCHAR | 0.0 | 0.0 | 1,746,801 | SND-0000BZ90LAKT6YZQ64HZ | SND-ZZZZUX0SDH8OP40MO2HT |  |  |
| send_date | TIMESTAMP | 0.0 | 0.0 | 1,729,711 | 2023-07-01 06:00:42 | 2026-06-18 05:59:53 |  |  |
| process_date | DATE | 0.0 | 0.0 | 1,083 | 2023-07-01 | 2026-06-17 |  |  |
| campaign_id | VARCHAR | 0.0 | 0.0 | 175 | CMP-06IKIC4I9JS9 | CMP-ZGVH3EG8L1AL |  | CMP-KJQXW6V6XZEH (33,999); CMP-3RQ0RM77AJRO (25,824); CMP-50EXSAPQSNH6 (25,319); CMP-7SE3FL9JKMZE (24,584); CMP-NZ44TUWPXMGF (22,498); CMP-5S6E6XSEOQ85 (20,266) |
| customer_id | VARCHAR | 0.0 | 0.0 | 150,000 | CLI-000RJ6XJD6RO | CLI-ZZZXUEQCAD15 |  | CLI-RX0QYKARYZRA (30); CLI-Q0FIGVUZJ3XG (29); CLI-XT3KEWFVG4ZK (29); CLI-10W2HYAMM04X (29); CLI-NLLKGSTNW2HX (28); CLI-4MYWVWH48FP4 (28) |
| send_channel | VARCHAR | 0.0 | 0.0 | 5 | Email | WhatsApp |  | Email (620,195); SMS (432,283); WhatsApp (349,144); Push (290,650); Voice (54,529) |
| template_used | VARCHAR | 10.03 | 0.0 | 875 | template_CMP-06IKIC4I9JS9_1 | template_CMP-ZGVH3EG8L1AL_5 |  | None (175,218); template_CMP-KJQXW6V6XZEH_5 (6,194); template_CMP-KJQXW6V6XZEH_3 (6,128); template_CMP-KJQXW6V6XZEH_1 (6,113); template_CMP-KJQXW6V6XZEH_2 (6,105); template_CMP-KJQXW6V6XZEH_4 (6,063) |
| subject | VARCHAR | 68.03 | 0.0 | 8 | ¡Oferta especial en Cuenta Ahorro! | ¡Oferta especial en nan! |  | None (1,188,342); ¡Oferta especial en Tarjeta Crédito! (191,344); ¡Oferta especial en Préstamo Personal! (95,544); ¡Oferta especial en Cuenta Corriente! (79,322); ¡Oferta especial en Cuenta Ahorro! (66,310); ¡Oferta especial en Inversión! (38,402) |
| send_status | VARCHAR | 0.0 | 0.0 | 4 | Blocked | Sent |  | Sent (1,642,044); Failed (52,306); Bounced (34,900); Blocked (17,551) |
| was_delivered | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | True (1,642,044); False (104,757) |
| was_opened | BOOLEAN | 27.72 | 0.0 | 2 | false | true |  | False (775,263); True (487,309); None (484,229) |
| open_date | TIMESTAMP | 72.1 | 0.0 | 485,996 | 2023-07-01 07:44:22 | 2026-06-25 03:30:02 |  |  |
| was_clicked | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | False (1,649,008); True (97,793) |
| click_date | TIMESTAMP | 94.4 | 0.0 | 97,749 | 2023-07-01 21:57:26 | 2026-06-24 23:51:59 |  |  |
| click_count | DOUBLE | 94.4 | 0.0 | 5 | 1.0 | 5.0 | 3.00 | None (1,649,008); 4.0 (19,649); 1.0 (19,593); 3.0 (19,564); 5.0 (19,498); 2.0 (19,489) |
| had_conversion | BOOLEAN | 0.0 | 0.0 | 2 | false | true |  | False (1,737,002); True (9,799) |
| conversion_date | TIMESTAMP | 99.44 | 0.0 | 9,798 | 2023-07-03 12:56:27 | 2026-06-26 08:26:49 |  |  |
| conversion_value | DOUBLE | 99.44 | 0.0 | 9,709 | 100.88 | 4999.75 | 2,533.36 |  |
| open_device | VARCHAR | 74.9 | 0.0 | 3 | Desktop | Tablet |  | None (1,308,424); Desktop (146,494); Tablet (146,450); Mobile (145,433) |
| open_country | VARCHAR | 74.9 | 0.0 | 3 | Argentina | México |  | None (1,308,278); México (219,090); Colombia (132,441); Argentina (86,992) |
| failure_reason | VARCHAR | 94.3 | 0.0 | 3 | Invalid email address | User blocked sender |  | None (1,647,204); SMTP error (49,706); Invalid email address (33,209); User blocked sender (16,682) |
| send_cost | DOUBLE | 15.0 | 0.0 | 2,901 | 0.0001 | 0.3 | 0.01 |  |

## Foreign keys

| Child | Parent | Non-null | Orphans | Orphan % |
| --- | --- | ---: | ---: | ---: |
| products.customer_id | customers.customer_id | 400,000 | 0 | 0.0 |
| transactions.customer_id | customers.customer_id | 4,425,008 | 0 | 0.0 |
| call_center_interactions.customer_id | customers.customer_id | 686,296 | 0 | 0.0 |
| call_transcripts.customer_id | customers.customer_id | 171,321 | 0 | 0.0 |
| satisfaction_surveys.customer_id | customers.customer_id | 212,759 | 0 | 0.0 |
| digital_events.customer_id | customers.customer_id | 11,875,548 | 0 | 0.0 |
| complaints.customer_id | customers.customer_id | 67,095 | 0 | 0.0 |
| campaign_sends.customer_id | customers.customer_id | 1,746,801 | 0 | 0.0 |
| customers.registration_branch_id | branches.branch_id | 150,000 | 149,995 | 99.997 |
| products.opening_branch_id | branches.branch_id | 400,000 | 0 | 0.0 |
| service_agents.assigned_branch_id | branches.branch_id | 833 | 831 | 99.76 |
| transactions.branch_id | branches.branch_id | 1,387,932 | 0 | 0.0 |
| complaints.related_branch_id | branches.branch_id | 19,178 | 0 | 0.0 |
| call_center_interactions.agent_id | service_agents.agent_id | 686,296 | 0 | 0.0 |
| call_transcripts.agent_id | service_agents.agent_id | 171,321 | 0 | 0.0 |
| satisfaction_surveys.agent_id | service_agents.agent_id | 212,759 | 0 | 0.0 |
| complaints.assigned_agent_id | service_agents.agent_id | 43,980 | 0 | 0.0 |
| transactions.product_id | products.product_id | 4,425,008 | 0 | 0.0 |
| digital_events.product_id | products.product_id | 1,440,338 | 0 | 0.0 |
| complaints.affected_product_id | products.product_id | 44,570 | 0 | 0.0 |
| campaign_sends.campaign_id | marketing_campaigns.campaign_id | 1,746,801 | 0 | 0.0 |
| call_transcripts.interaction_id | call_center_interactions.interaction_id | 171,321 | 0 | 0.0 |
| satisfaction_surveys.interaction_id | call_center_interactions.interaction_id | 212,759 | 0 | 0.0 |
| complaints.origin_interaction_id | call_center_interactions.interaction_id | 0 | 0 | None |

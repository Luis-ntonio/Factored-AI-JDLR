# Detalle por automatización — Belcorp UAT (Insider → ISA → Publish)

Documento técnico **nodo a nodo** derivado de `get_automation` en UAT. Complementa [E2E-Insider-Trigger-to-Publish-Response-UAT.md](./E2E-Insider-Trigger-to-Publish-Response-UAT.md).

**Automatizaciones incluidas:** 19 (deduplicadas por `id`, preferencia al JSON más grande).

| ID | Nombre |
|----|--------|
| `66966960e8797a59f4a46292` | Trigger AI Agent |
| `6732f70850384a29acf312fd` | Trigger AI Agent (Async) |
| `67487a0fda695160fbebe499` | Belcorp / Detect Country and Channel |
| `674afe5adefb851816d61959` | Case Management (AI Agent) |
| `675d880d54db1a77c168e65d` | Custom COPILOT |
| `67614f02eb7c6a04b9dba6dc` | Insider Publisher - v1 |
| `6762c4dac2f4913e6ab8a309` | Insider Trigger- v1 |
| `676dae390c93231c945e8d7d` | Belcorp / Diamond Consultant |
| `676db02f0c93231c945eb607` | Belcorp / Check if diamond consultant |
| `6783284f44ce135db1dab279` | Prompt Builder |
| `67834374fc387b38c73b7972` | System Prompt Builder |
| `67850d225384a9541846f5b9` | Agent Executor  |
| `679629c41a248f0b3415c3b1` | User/Assistant Prompt Builder |
| `67d5ca385c39266befb90a21` | Model Based System Prompt Builder |
| `67e26f9c2807cf04c7f860db` | Get Agent Tools and Attributes |
| `682dc974e1b22528650c642f` | Belcorp / User Input Handling |
| `6851442f9e30586f552a6d73` | Call LLM (AI Agent) Wrapper |
| `693e98e086c48457515a14d9` | LoginSDK New test |
| `698edb1fbd2e947f513f67cf` | Cached hit status store  |

**Convenciones**
- **Índice builder**: orden de diseño en el editor (`index`).
- **Orden BFS**: recorrido aproximado del runtime siguiendo `edges` desde `START`.
- **`skip: true`**: nodo deshabilitado salvo activación manual.
- **HTTP**: `baseUrl` suele venir de `__ENV__` (p. ej. `Base_Url_Prod_SB`, `Base_URL_QA`).
- **Publish**: `conv_ai_by_unifyapps_publish_response` → interface `__ua__publish_response_interface` → canal (`67614f02…` Insider Publisher).

### Cadena E2E (referencia rápida)

1. `6762c4da…` Insider Trigger → `_a4P2Z` Case Management `674afe5a…`
2. País/teléfono `67487a0f…` → diamond `676db02f…` / handler `676dae39…`
3. Login `693e98e0…` (HTTP `/api/login`, tokens) → segundo agente si `isValid`
4. Agente async `6732f708…` → `66966960…` → executor `67850d22…`
5. Prompt `6783284f…` → system prompt `67834374…` (`67e26f9c…` tools, `67d5ca38…` template)
6. Publish async `6732f708` nodo `_GbavD` → Publisher `67614f02…`

---

<!-- source: 66966960e8797a59f4a46292.json -->
## Trigger AI Agent

| Campo | Valor |
|-------|-------|
| **ID** | `66966960e8797a59f4a46292` |
| **lcName** | trigger ai agent |
| **Deploy** | v84 / wf v289 |
| **Definition** | `6a5219789a308f0d8f0b0152` |
| **Nodos / edges** | 75 / 92 |

### Objetos (`object_type`)
- `debug_agent` — nodos: `_W4DLh`, `_gcC3v`, `6tL7q`, `XkxhP`, `_AJ1k0`, `_vvTqE`
- `e_ai_agent_conversation_state` — nodos: `gk2RF`, `I1OTM`, `_YgebH`, `AYiZm`, `n_4AqUl`, `n_uXgXj`
- `e_prerequisite_task_ai_agent` — nodos: `ildZ2`
- `prerequisite_action_output_store` — nodos: `n_4zJwj`
- `service_hub_attachment` — nodos: `n_AA6Jh`
- `service_hub_case` — nodos: `n_OqhAB`, `_nf7O9`, `IHAik`, `_PWblN`
- `service_hub_message` — nodos: `_qidtI`, `n_NlebL`, `EjZ3h`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `4nhTP` | `{{ b1Up4.outputs.item.properties.automationId }}` | True |
| `55JKi` | `67a48d37f8f1744841dabb63` | True |
| `Es78y` | `67933cc866e1f1098aa02c39` | True |
| `X1MB0` | `67b4908aaffe713b4ced2d83` | True |
| `_6xCrQ` | `67419516deb2aa254818a06d` | False |
| `_Cpndc` | `68ad6550c2dc2d2036d2b3c5` | True |
| `_uJDuh` | `68ad6550c2dc2d2036d2b3c5` | True |
| `cgzKP` | `67850d225384a9541846f5b9` | True |
| `n_X04Rj` | `68c51597269ad81cc750a3ca` | False |
| `n_uP3JD` | `67b4908aaffe713b4ced2d83` | True |
| `pEZXT` | `67b4908aaffe713b4ced2d83` | True |
| `tnzxh` | `67deb0e06ff2a877050838dd` | True |

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`vBzOH`** [START] Trigger from automation
2. **`YJDSg`** [IF_ELSE] Condition
3. **`n_OqhAB`** [ACTION] Fetch record by ID → `service_hub_case`
4. **`691VI`** [STOP] Respond to automation
5. **`53LAF`** [ACTION] Get Session Variables
6. **`_u4Cu9`** [IF_ELSE] Condition
7. **`_nf7O9`** [ACTION] Update an existing record's fields → `service_hub_case`
8. **`_rad7i`** [STOP] Respond to automation
9. **`n_X04Rj`** [CALL_WORKFLOW] Call automation → auto `68c51597269ad81cc750a3ca`
10. **`_7Qnuz`** [ACTION] Set Session Variables
11. **`_jxDmp`** [ACTION] Create variables
12. **`55JKi`** [CALL_WORKFLOW] Call automation → auto `67a48d37f8f1744841dabb63`
13. **`_sj7y9`** [IF_ELSE] Condition
14. **`VMKDo`** [IF_ELSE] Condition
15. **`tnzxh`** [CALL_WORKFLOW] Call automation → auto `67deb0e06ff2a877050838dd`
16. **`EjZ3h`** [ACTION] Count records → `service_hub_message`
17. **`gk2RF`** [ACTION] Fetch record by ID → `e_ai_agent_conversation_state`
18. **`paMfX`** [IF_ELSE] Condition
19. **`_z1VWT`** [IF_ELSE] Condition
20. **`WfYou`** [IF_ELSE] Condition
21. **`7m9w4`** [STOP] Respond to automation
22. **`AgigK`** [ACTION] Update variables
23. **`ms3X5`** [ACTION] Create list
24. **`_6xCrQ`** [CALL_WORKFLOW] Call automation → auto `67419516deb2aa254818a06d`
25. **`RZFta`** [BRANCH] 
26. **`I1OTM`** [ACTION] Update records by query → `e_ai_agent_conversation_state`
27. **`y20MZ`** [STOP] Stop
28. **`n_yhPdW`** [IF_ELSE] Condition
29. **`Es78y`** [CALL_WORKFLOW] Call automation → auto `67933cc866e1f1098aa02c39`
30. **`RZFta@1`** [BRANCH_CONDITION] 
31. **`RZFta@2`** [BRANCH_CONDITION] 
32. **`_AJ1k0`** [ACTION] Update records by query → `debug_agent` *(skip)*
33. **`_qidtI`** [ACTION] Update an existing record's fields → `service_hub_message`
34. **`n_uXgXj`** [ACTION] Update records by query → `e_ai_agent_conversation_state`
35. **`pEZXT`** [CALL_WORKFLOW] Call automation → auto `67b4908aaffe713b4ced2d83`
36. **`n_NlebL`** [ACTION] Fetch records → `service_hub_message`
37. **`IHAik`** [ACTION] Update an existing record's fields → `service_hub_case`
38. **`_PWblN`** [ACTION] Update an existing record's fields → `service_hub_case`
39. **`SThPI`** [STOP] Respond to automation
40. **`_Cpndc`** [CALL_WORKFLOW] Call automation → auto `68ad6550c2dc2d2036d2b3c5`
41. **`n_AA6Jh`** [ACTION] Fetch records → `service_hub_attachment`
42. **`_KCee4`** [IF_ELSE] Condition
43. **`_z6FNM`** [IF_ELSE] Condition
44. **`Iq9ab`** [ACTION] Execute Groovy code
45. **`n_YlSob`** [ACTION] Create variables
46. **`AYiZm`** [ACTION] Create record → `e_ai_agent_conversation_state`
47. **`_YgebH`** [ACTION] Update an existing record's fields → `e_ai_agent_conversation_state`
48. **`cgzKP`** [CALL_WORKFLOW] Call automation → auto `67850d225384a9541846f5b9`
49. **`n_SIFPj`** [IF_ELSE] Condition
50. **`_gcC3v`** [ACTION] Fetch records → `debug_agent` *(skip)*
51. **`n_4AqUl`** [ACTION] Update records by query → `e_ai_agent_conversation_state`
52. **`_uJDuh`** [CALL_WORKFLOW] Call automation → auto `68ad6550c2dc2d2036d2b3c5`
53. **`_W4DLh`** [ACTION] Update records by query → `debug_agent` *(skip)*
54. **`n_pw1fZ`** [ACTION] Execute Groovy code
55. **`1eosy`** [IF_ELSE] Condition
56. **`n_uP3JD`** [CALL_WORKFLOW] Call automation → auto `67b4908aaffe713b4ced2d83`
57. **`_IzuRI`** [ACTION] Execute Groovy code
58. **`lMkfV`** [ACTION] Emit signal
59. **`n_5Ywj9`** [ACTION] Update variables
60. **`XkxhP`** [ACTION] Update an existing record → `debug_agent` *(skip)*
61. **`6tL7q`** [ACTION] Update records by query → `debug_agent` *(skip)*
62. **`_tKktC`** [STOP] Respond to automation
63. **`_vvTqE`** [ACTION] Update records by query → `debug_agent`
64. **`Ms3LJ`** [STOP] Respond to automation
65. **`n_qfwwm`** [ACTION] Get Session Variables
66. **`YbKQo`** [IF_ELSE] Condition
67. **`ildZ2`** [ACTION] Fetch records → `e_prerequisite_task_ai_agent`
68. **`Kubwh`** [ACTION] Create variables
69. **`b1Up4`** [LOOP] For loop
70. **`X1MB0`** [CALL_WORKFLOW] Call automation → auto `67b4908aaffe713b4ced2d83`
71. **`CixCG`** [ACTION] Execute Groovy code
72. **`n_NQSKi`** [ACTION] Set Session Variables
73. **`4nhTP`** [CALL_WORKFLOW] Call automation → auto `{{ b1Up4.outputs.item.properties.automationId }}`
74. **`l3Fxa`** [STOP] Respond to automation
75. **`n_4zJwj`** [ACTION] Create record → `prerequisite_action_output_store`

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `vBzOH` | START | Trigger from automation | `callables_from_automation` | `` | `` | False |
| 2 | `YJDSg` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 3 | `691VI` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 4 | `n_OqhAB` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `service_hub_case` | `` | False |
| 5 | `53LAF` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 6 | `_u4Cu9` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 7 | `_rad7i` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 8 | `_nf7O9` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 9 | `n_X04Rj` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `68c51597269ad81cc750a3ca` | False |
| 10 | `_7Qnuz` | ACTION | Set Session Variables | `variable_by_unifyapps_set_session_variab` | `` | `` | False |
| 11 | `_jxDmp` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 12 | `55JKi` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67a48d37f8f1744841dabb63` | False |
| 13 | `_sj7y9` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 14 | `tnzxh` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67deb0e06ff2a877050838dd` | False |
| 15 | `paMfX` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 16 | `AgigK` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 17 | `n_yhPdW` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 18 | `_qidtI` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_message` | `` | False |
| 19 | `7m9w4` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 20 | `y20MZ` | STOP | Stop | `` | `` | `` | False |
| 21 | `VMKDo` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 22 | `gk2RF` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `e_ai_agent_conversation_state` | `` | False |
| 23 | `WfYou` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 24 | `I1OTM` | ACTION | Update records by query | `storage_by_unifyapps_update_record_field` | `e_ai_agent_conversation_state` | `` | False |
| 25 | `RZFta` | BRANCH |  | `` | `` | `` | False |
| 26 | `RZFta@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 27 | `n_NlebL` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message` | `` | False |
| 28 | `n_AA6Jh` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_attachment` | `` | False |
| 29 | `n_YlSob` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 30 | `n_SIFPj` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 31 | `n_pw1fZ` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 32 | `n_5Ywj9` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 33 | `_W4DLh` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `debug_agent` | `` | True |
| 34 | `lMkfV` | ACTION | Emit signal | `signals_by_unifyapps_emit_signal` | `` | `` | False |
| 35 | `Ms3LJ` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 36 | `RZFta@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 37 | `IHAik` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 38 | `_KCee4` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 39 | `_YgebH` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `e_ai_agent_conversation_state` | `` | False |
| 40 | `AYiZm` | ACTION | Create record | `storage_by_unifyapps_create_record` | `e_ai_agent_conversation_state` | `` | False |
| 41 | `_gcC3v` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `debug_agent` | `` | True |
| 42 | `1eosy` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 43 | `6tL7q` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `debug_agent` | `` | True |
| 44 | `XkxhP` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `debug_agent` | `` | True |
| 45 | `n_qfwwm` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 46 | `YbKQo` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 47 | `Kubwh` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 48 | `ildZ2` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `e_prerequisite_task_ai_agent` | `` | False |
| 49 | `b1Up4` | LOOP | For loop | `loop_for_each` | `` | `` | False |
| 50 | `CixCG` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 51 | `4nhTP` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `{{ b1Up4.outputs.item.proper` | False |
| 52 | `n_4zJwj` | ACTION | Create record | `storage_by_unifyapps_create_record` | `prerequisite_action_output_store` | `` | False |
| 53 | `X1MB0` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67b4908aaffe713b4ced2d83` | False |
| 54 | `n_NQSKi` | ACTION | Set Session Variables | `variable_by_unifyapps_set_session_variab` | `` | `` | False |
| 55 | `l3Fxa` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 56 | `_AJ1k0` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `debug_agent` | `` | True |
| 57 | `_PWblN` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 58 | `_z6FNM` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 59 | `cgzKP` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67850d225384a9541846f5b9` | False |
| 60 | `_uJDuh` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `68ad6550c2dc2d2036d2b3c5` | False |
| 61 | `_IzuRI` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 62 | `_vvTqE` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `debug_agent` | `` | False |
| 63 | `n_4AqUl` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `e_ai_agent_conversation_state` | `` | False |
| 64 | `n_uP3JD` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67b4908aaffe713b4ced2d83` | False |
| 65 | `_tKktC` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 66 | `EjZ3h` | ACTION | Count records | `storage_by_unifyapps_count_records` | `service_hub_message` | `` | False |
| 67 | `_z1VWT` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 68 | `_6xCrQ` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67419516deb2aa254818a06d` | False |
| 69 | `ms3X5` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 70 | `Es78y` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67933cc866e1f1098aa02c39` | False |
| 71 | `pEZXT` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67b4908aaffe713b4ced2d83` | False |
| 72 | `_Cpndc` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `68ad6550c2dc2d2036d2b3c5` | False |
| 73 | `Iq9ab` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 74 | `n_uXgXj` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `e_ai_agent_conversation_state` | `` | False |
| 75 | `SThPI` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 6732f70850384a29acf312fd.json -->
## Trigger AI Agent (Async)

| Campo | Valor |
|-------|-------|
| **ID** | `6732f70850384a29acf312fd` |
| **lcName** | trigger ai agent (async) |
| **Deploy** | v18 / wf v62 |
| **Definition** | `6a5219b29a308f0d8f0b031e` |
| **Nodos / edges** | 11 / 12 |

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `QOdfO` | `66966960e8797a59f4a46292` | True |
| `_UN969` | `67b4908aaffe713b4ced2d83` | False |
| `n_daiSJ` | `68ad6550c2dc2d2036d2b3c5` | True |
| `pEZXT` | `67b4908aaffe713b4ced2d83` | False |

### Publicación al usuario (`conv_ai_by_unifyapps_publish_response`)

- **`_GbavD`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _xRkHq.outputs.caseId }}

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`_xRkHq`** [START] Trigger via automation
2. **`n_vAqrC`** [ACTION] Create variables
3. **`QOdfO`** [CALL_WORKFLOW] Call automation → auto `66966960e8797a59f4a46292`
4. **`cDYWi`** [ACTION] Update variables
5. **`n_daiSJ`** [CALL_WORKFLOW] Call automation → auto `68ad6550c2dc2d2036d2b3c5`
6. **`_G7AYI`** [IF_ELSE] Condition
7. **`pEZXT`** [CALL_WORKFLOW] Call automation → auto `67b4908aaffe713b4ced2d83`
8. **`_eQ3tj`** [ACTION] Execute Groovy code
9. **`_N9w9Q`** [STOP] Respond to automation
10. **`_GbavD`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
11. **`_UN969`** [CALL_WORKFLOW] Call automation → auto `67b4908aaffe713b4ced2d83`

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `_xRkHq` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `n_vAqrC` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 3 | `QOdfO` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `66966960e8797a59f4a46292` | False |
| 4 | `cDYWi` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 5 | `_G7AYI` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 6 | `_eQ3tj` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 7 | `_GbavD` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 8 | `_UN969` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67b4908aaffe713b4ced2d83` | False |
| 9 | `n_daiSJ` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `68ad6550c2dc2d2036d2b3c5` | False |
| 10 | `pEZXT` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67b4908aaffe713b4ced2d83` | False |
| 11 | `_N9w9Q` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 67487a0fda695160fbebe499.json -->
## Belcorp | Detect Country and Channel

| Campo | Valor |
|-------|-------|
| **ID** | `67487a0fda695160fbebe499` |
| **lcName** | belcorp | detect country and channel |
| **Deploy** | v311 / wf v494 |
| **Definition** | `6a60e9e143d18c287cc96525` |
| **Nodos / edges** | 19 / 21 |

### Objetos (`object_type`)
- `belcorp_customer_number` — nodos: `_deACs`, `_3BVRH`
- `belcorp_tester` — nodos: `uEmo5`
- `service_hub_case` — nodos: `_f1TSV`
- `snowflake_case_level_2` — nodos: `eqhi8`

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`_8lQjQ`** [START] Trigger via automation
2. **`_f1TSV`** [ACTION] Fetch records → `service_hub_case`
3. **`_YNXil`** [IF_ELSE] Condition
4. **`_q3iyS`** [STOP] Respond to automation
5. **`uEmo5`** [ACTION] Fetch records → `belcorp_tester`
6. **`oxAXQ`** [ACTION] Create variables
7. **`FAjbq`** [IF_ELSE] Condition
8. **`soznP`** [ACTION] Update variables
9. **`ng4OC`** [ACTION] Update variables
10. **`_wdt8Z`** [ACTION] Execute Groovy code
11. **`eqhi8`** [ACTION] Update records by query → `snowflake_case_level_2`
12. **`_qRxRn`** [IF_ELSE] Condition
13. **`_p0pj7`** [ACTION] Create variables
14. **`_xbEAx`** [CALL_INTERFACE_WORKFLOW] Collect Slots
15. **`_3IwIR`** [ACTION] Execute Groovy code
16. **`_yOq2J`** [ACTION] Create variables
17. **`_3BVRH`** [ACTION] Update an existing record → `belcorp_customer_number`
18. **`_MuM8w`** [ACTION] Execute Groovy code
19. **`_deACs`** [ACTION] Update an existing record → `belcorp_customer_number`

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `_8lQjQ` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `_f1TSV` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 3 | `_YNXil` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 4 | `uEmo5` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_tester` | `` | False |
| 5 | `oxAXQ` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 6 | `FAjbq` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 7 | `ng4OC` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 8 | `soznP` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 9 | `_wdt8Z` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 10 | `eqhi8` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `snowflake_case_level_2` | `` | False |
| 11 | `_qRxRn` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 12 | `_xbEAx` | CALL_INTERFACE_WORKFLOW | Collect Slots | `conv_ai_by_unifyapps_collect_slots` | `` | `` | False |
| 13 | `_yOq2J` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 14 | `_MuM8w` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 15 | `_deACs` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_customer_number` | `` | False |
| 16 | `_p0pj7` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 17 | `_3IwIR` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 18 | `_3BVRH` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_customer_number` | `` | False |
| 19 | `_q3iyS` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 674afe5adefb851816d61959.json -->
## Case Management (AI Agent)

| Campo | Valor |
|-------|-------|
| **ID** | `674afe5adefb851816d61959` |
| **lcName** | case management (ai agent) |
| **Deploy** | v85 / wf v175 |
| **Definition** | `6a521a2da86b60033e9c7a32` |
| **Nodos / edges** | 92 / 124 |

### Objetos (`object_type`)
- `ai_agent_deployment` — nodos: `_g3Dps`
- `e_ai_agent_conversation_state` — nodos: `_zarm8`
- `service_hub_attachment` — nodos: `_mwgSk`
- `service_hub_case` — nodos: `JIhSS`, `_WSUdo`, `_z4Kvr`, `_UQ7cf`, `n_v41zS`, `J4sm9`, `QXul1`, `n_xidli`, … (+8)
- `service_hub_message` — nodos: `KT5pZ`, `_vLnEy`, `_hE3xz`, `n_A2PKn`, `n_EDxJX`, `TymVX`, `n_UuMbj`, `_F7xeB`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `DXrXv` | `66eaeecb5dd77636e1fcc1f9` | True |
| `n_H2RTy` | `68b00489de874978c99b01b7` | False |
| `n_Hjeoi` | `690b60f830354b0f7816ea57` | True |

### Otras interfaces callable
- `zthvu` → `6820f6dbccc45f469e28bd52` (callables_call_interface)

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`_FlBIT`** [START] Trigger via automation
2. **`OQ829`** [ACTION] Create variables
3. **`Szfjl`** [IF_ELSE] Condition
4. **`_7i3Ni`** [IF_ELSE] Condition
5. **`KT5pZ`** [ACTION] Fetch records → `service_hub_message`
6. **`_xMiVc`** [IF_ELSE] Condition
7. **`aklC8`** [IF_ELSE] Condition
8. **`5DI0h`** [IF_ELSE] Condition
9. **`_UQ7cf`** [ACTION] Fetch record by ID → `service_hub_case`
10. **`_Vj83Q`** [BRANCH] 
11. **`DXrXv`** [CALL_WORKFLOW] Call automation → auto `66eaeecb5dd77636e1fcc1f9`
12. **`LXXio`** [STOP] Respond to automation
13. **`RKaF9`** [IF_ELSE] Condition
14. **`_Vj83Q@1`** [BRANCH_CONDITION] 
15. **`_Vj83Q@2`** [BRANCH_CONDITION] 
16. **`_Vj83Q@3`** [BRANCH_CONDITION] 
17. **`_Vj83Q@4`** [BRANCH_CONDITION] 
18. **`n_3jQM1`** [ACTION] Execute Groovy code
19. **`VSNwv`** [ACTION] Update variables
20. **`QXul1`** [ACTION] Update an existing record's fields → `service_hub_case`
21. **`n_fmOco`** [IF_ELSE] Condition
22. **`JIhSS`** [ACTION] Create record → `service_hub_case`
23. **`_vLnEy`** [ACTION] Fetch records → `service_hub_message`
24. **`_hE3xz`** [ACTION] Fetch records → `service_hub_message`
25. **`zthvu`** [CALL_WORKFLOW] Call interface
26. **`_PYIH2`** [IF_ELSE] Condition
27. **`J4sm9`** [ACTION] Create record → `service_hub_case`
28. **`n_YQfh6`** [IF_ELSE] Condition
29. **`_4Qfhc`** [ACTION] Update variables
30. **`_yjjpo`** [IF_ELSE] Condition
31. **`_S29iT`** [IF_ELSE] Condition
32. **`nIpBY`** [ACTION] Update variables
33. **`n_y7hBn`** [IF_ELSE] Condition
34. **`_g3Dps`** [ACTION] Fetch records → `ai_agent_deployment`
35. **`w7T0g`** [ACTION] Update variables
36. **`_iun7O`** [STOP] Respond to automation
37. **`n_v41zS`** [ACTION] Update an existing record → `service_hub_case`
38. **`_WSUdo`** [ACTION] Create record → `service_hub_case`
39. **`_fKDsn`** [ACTION] Update variables
40. **`_z4Kvr`** [ACTION] Create record → `service_hub_case`
41. **`_ws9Om`** [ACTION] Update variables
42. **`NlhVg`** [ACTION] Execute Groovy Code
43. **`n_5Qr8y`** [STOP] Respond to automation
44. **`BWL4g`** [ACTION] Get Session Variables
45. **`_8hbgO`** [ACTION] Update variables
46. **`_aJReJ`** [ACTION] Update variables
47. **`_eawAx`** [ACTION] Update variables
48. **`_xzuqG`** [ACTION] Create variables
49. **`_zarm8`** [ACTION] Create record → `e_ai_agent_conversation_state`
50. **`Ohyp8`** [ACTION] Get Session Variables
51. **`Jaaay`** [ACTION] Create variables
52. **`mgoLt`** [IF_ELSE] Condition
53. **`wVKLJ`** [IF_ELSE] Condition
54. **`n_x11FZ`** [IF_ELSE] Condition
55. **`KmSn5`** [ACTION] Update variables
56. **`TymVX`** [ACTION] Create record → `service_hub_message`
57. **`n_xidli`** [ACTION] Update an existing record's fields → `service_hub_case`
58. **`n_TcjJu`** [IF_ELSE] Condition
59. **`n_8NUzc`** [IF_ELSE] Condition
60. **`n_LiKNW`** [IF_ELSE] Condition
61. **`n_k2Nv2`** [ACTION] Fetch record by ID → `service_hub_case`
62. **`n_A2PKn`** [ACTION] Fetch records → `service_hub_message`
63. **`n_h9VEQ`** [IF_ELSE] Condition
64. **`n_xDpIn`** [IF_ELSE] Condition
65. **`n_4nCGV`** [IF_ELSE] Condition
66. **`n_GD5QZ`** [IF_ELSE] Condition
67. **`n_H2RTy`** [CALL_WORKFLOW] Call automation → auto `68b00489de874978c99b01b7`
68. **`n_SO6XI`** [IF_ELSE] Condition
69. **`n_UxJAx`** [IF_ELSE] Condition
70. **`_8qTaO`** [ACTION] Update an existing record's fields → `service_hub_case`
71. **`n_Hjeoi`** [CALL_WORKFLOW] Call automation → auto `690b60f830354b0f7816ea57`
72. **`_rLHU1`** [ACTION] Update records by query → `service_hub_case`
73. **`n_EDxJX`** [ACTION] Fetch record by ID → `service_hub_message`
74. **`_d7eh5`** [ACTION] Update an existing record's fields → `service_hub_case`
75. **`_i7uzj`** [ACTION] Update an existing record's fields → `service_hub_case`
76. **`Eq14o`** [IF_ELSE] Condition
77. **`n_M8gYY`** [ACTION] Update an existing record's fields → `service_hub_case`
78. **`n_pYZqj`** [ACTION] Update variables
79. **`n_zyxHh`** [IF_ELSE] Condition
80. **`_9BIaq`** [ACTION] Create variables
81. **`o2OTh`** [ACTION] Update an existing record's fields → `service_hub_case`
82. **`_uQlav`** [ACTION] Update an existing record's fields → `service_hub_case`
83. **`_YNpxx`** [LOOP] For loop
84. **`n_0MGQ7`** [ACTION] Set Session Variables
85. **`_hdJXy`** [IF_ELSE] Condition
86. **`n_kONmX`** [ACTION] Execute Groovy code
87. **`n_UuMbj`** [ACTION] Update an existing record's fields → `service_hub_message`
88. **`_JpdhN`** [STOP] Respond to automation
89. **`_F7xeB`** [ACTION] Update an existing record's fields → `service_hub_message`
90. **`_o6uYg`** [IF_ELSE] Condition
91. **`_mwgSk`** [ACTION] Create record → `service_hub_attachment`
92. **`_QXMai`** [ACTION] Update variables

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `_FlBIT` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `OQ829` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 3 | `Szfjl` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 4 | `KT5pZ` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message` | `` | False |
| 5 | `5DI0h` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 6 | `LXXio` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 7 | `_7i3Ni` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 8 | `aklC8` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 9 | `DXrXv` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `66eaeecb5dd77636e1fcc1f9` | False |
| 10 | `VSNwv` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 11 | `_xMiVc` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 12 | `_Vj83Q` | BRANCH |  | `` | `` | `` | False |
| 13 | `_Vj83Q@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 14 | `JIhSS` | ACTION | Create record | `storage_by_unifyapps_create_record` | `service_hub_case` | `` | False |
| 15 | `_4Qfhc` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 16 | `_Vj83Q@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 17 | `_vLnEy` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message` | `` | False |
| 18 | `_yjjpo` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 19 | `_fKDsn` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 20 | `_WSUdo` | ACTION | Create record | `storage_by_unifyapps_create_record` | `service_hub_case` | `` | False |
| 21 | `_aJReJ` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 22 | `_Vj83Q@3` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 23 | `_hE3xz` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message` | `` | False |
| 24 | `_S29iT` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 25 | `_ws9Om` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 26 | `_z4Kvr` | ACTION | Create record | `storage_by_unifyapps_create_record` | `service_hub_case` | `` | False |
| 27 | `_eawAx` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 28 | `_Vj83Q@4` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 29 | `zthvu` | CALL_WORKFLOW | Call interface | `callables_call_interface` | `` | `` | False |
| 30 | `nIpBY` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 31 | `n_3jQM1` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 32 | `_UQ7cf` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `service_hub_case` | `` | False |
| 33 | `RKaF9` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 34 | `n_fmOco` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 35 | `n_YQfh6` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 36 | `n_v41zS` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `service_hub_case` | `` | False |
| 37 | `_8hbgO` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 38 | `_iun7O` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 39 | `J4sm9` | ACTION | Create record | `storage_by_unifyapps_create_record` | `service_hub_case` | `` | False |
| 40 | `w7T0g` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 41 | `QXul1` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 42 | `_PYIH2` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 43 | `_g3Dps` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `ai_agent_deployment` | `` | False |
| 44 | `BWL4g` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 45 | `_zarm8` | ACTION | Create record | `storage_by_unifyapps_create_record` | `e_ai_agent_conversation_state` | `` | False |
| 46 | `n_y7hBn` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 47 | `n_5Qr8y` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 48 | `NlhVg` | ACTION | Execute Groovy Code | `code_by_unifyapps_groovy` | `` | `` | False |
| 49 | `_xzuqG` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 50 | `Ohyp8` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 51 | `Jaaay` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 52 | `mgoLt` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 53 | `wVKLJ` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 54 | `KmSn5` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 55 | `n_x11FZ` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 56 | `n_xidli` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 57 | `n_8NUzc` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 58 | `n_A2PKn` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message` | `` | False |
| 59 | `n_GD5QZ` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 60 | `n_EDxJX` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `service_hub_message` | `` | False |
| 61 | `n_pYZqj` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 62 | `TymVX` | ACTION | Create record | `storage_by_unifyapps_create_record` | `service_hub_message` | `` | False |
| 63 | `n_TcjJu` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 64 | `n_k2Nv2` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `service_hub_case` | `` | False |
| 65 | `n_4nCGV` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 66 | `_rLHU1` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 67 | `n_Hjeoi` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `690b60f830354b0f7816ea57` | False |
| 68 | `n_LiKNW` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 69 | `n_xDpIn` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 70 | `_8qTaO` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 71 | `n_h9VEQ` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 72 | `n_SO6XI` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 73 | `_i7uzj` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 74 | `_d7eh5` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 75 | `n_zyxHh` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 76 | `_uQlav` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 77 | `n_H2RTy` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `68b00489de874978c99b01b7` | False |
| 78 | `n_UxJAx` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 79 | `n_M8gYY` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 80 | `Eq14o` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 81 | `o2OTh` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 82 | `n_0MGQ7` | ACTION | Set Session Variables | `variable_by_unifyapps_set_session_variab` | `` | `` | False |
| 83 | `n_UuMbj` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_message` | `` | False |
| 84 | `_9BIaq` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 85 | `_YNpxx` | LOOP | For loop | `loop_for_each` | `` | `` | False |
| 86 | `n_kONmX` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 87 | `_o6uYg` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 88 | `_mwgSk` | ACTION | Create record | `storage_by_unifyapps_create_record` | `service_hub_attachment` | `` | False |
| 89 | `_QXMai` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 90 | `_hdJXy` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 91 | `_F7xeB` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_message` | `` | False |
| 92 | `_JpdhN` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 675d880d54db1a77c168e65d.json -->
## Custom COPILOT

| Campo | Valor |
|-------|-------|
| **ID** | `675d880d54db1a77c168e65d` |
| **lcName** | custom copilot |
| **Deploy** | v10 / wf v28 |
| **Definition** | `69efc4073597bf2a6e1f37a7` |
| **Nodos / edges** | 7 / 7 |

### Objetos (`object_type`)
- `service_hub_case` — nodos: `eapbK`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `6Eyre` | `6752da8f6d52326658dd806f` | True |
| `S6lWP` | `67b4908aaffe713b4ced2d83` | True |
| `n_esmhi` | `67e6230f136d25090dc9999d` | True |

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`_DliWT`** [START] Trigger via automation
2. **`S6lWP`** [CALL_WORKFLOW] Call automation → auto `67b4908aaffe713b4ced2d83`
3. **`eapbK`** [ACTION] Fetch records → `service_hub_case`
4. **`2uZq0`** [IF_ELSE] Condition
5. **`n_esmhi`** [CALL_WORKFLOW] Call automation → auto `67e6230f136d25090dc9999d`
6. **`6Eyre`** [CALL_WORKFLOW] Call automation → auto `6752da8f6d52326658dd806f`
7. **`_J9iJK`** [STOP] Respond to automation

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `_DliWT` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `S6lWP` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67b4908aaffe713b4ced2d83` | False |
| 3 | `eapbK` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 4 | `2uZq0` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 5 | `6Eyre` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6752da8f6d52326658dd806f` | False |
| 6 | `n_esmhi` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67e6230f136d25090dc9999d` | False |
| 7 | `_J9iJK` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 67614f02eb7c6a04b9dba6dc.json -->
## Insider Publisher - v1

| Campo | Valor |
|-------|-------|
| **ID** | `67614f02eb7c6a04b9dba6dc` |
| **lcName** | insider publisher - v1 |
| **Deploy** | v139 / wf v263 |
| **Definition** | `6a85f2ef37f5bb054b8d6421` |
| **Nodos / edges** | 54 / 73 |

### Llamadas HTTP (`custom_http_endpoint*`)

| Node | Título | Detalle |
|------|--------|---------|
| `_b94ib` | Create UnifyApps file from url | url={{ _CaWgP.outputs.item.url }} |
| `_OqNxF` | Create UnifyApps file from url | url={{ _CaWgP.outputs.item.url }} |
| `_MB5Ku` | Create UnifyApps file from url | url={{ _CaWgP.outputs.item.url }} |

### Otras interfaces callable
- `_fYj3J` → `66e80063f5ec4205eb06242c` (callables_from_interface)

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`_fYj3J`** [START] Trigger interface
2. **`_L2kt0`** [ACTION] Execute Groovy code
3. **`_zkmyD`** [ACTION] Execute Groovy code
4. **`_JeZ0a`** [IF_ELSE] Condition
5. **`_teToi`** [IF_ELSE] Condition
6. **`_CaWgP`** [LOOP] For loop
7. **`_7q6c7`** [ACTION] Execute Groovy code
8. **`FVfIV`** [IF_ELSE] Condition
9. **`_sgPNJ`** [STOP] Respond to automation
10. **`_rvtAo`** [BRANCH] 
11. **`_f6MvW`** [IF_ELSE] Condition
12. **`WiWbx`** [ACTION] Execute Groovy code
13. **`_jeWKa`** [ACTION] Whatsapp message with button reply
14. **`_rvtAo@1`** [BRANCH_CONDITION] 
15. **`_rvtAo@2`** [BRANCH_CONDITION] 
16. **`_rvtAo@3`** [BRANCH_CONDITION] 
17. **`_zWtXP`** [ACTION] Whatsapp text message
18. **`_BOVmW`** [LOOP] For loop
19. **`_ylI4C`** [ACTION] Whatsapp message with button reply
20. **`_WkqzK`** [IF_ELSE] Condition
21. **`_AKWCy`** [IF_ELSE] Condition
22. **`_On1YX`** [IF_ELSE] Condition
23. **`_2qxda`** [ACTION] Whatsapp media message as image
24. **`_zfpRN`** [ACTION] Whatsapp media message as image
25. **`_b94ib`** [ACTION] Create UnifyApps file from url → HTTP
26. **`_yzLGA`** [ACTION] Whatsapp upload file
27. **`_OqNxF`** [ACTION] Create UnifyApps file from url → HTTP
28. **`_Y1rqA`** [ACTION] Whatsapp upload file
29. **`_MB5Ku`** [ACTION] Create UnifyApps file from url → HTTP
30. **`_BzXQ3`** [IF_ELSE] Condition
31. **`_olYpA`** [IF_ELSE] Condition
32. **`_nZnXy`** [BRANCH] 
33. **`_TW082`** [ACTION] Whatsapp media message as image
34. **`_NcS5B`** [ACTION] Generate public file URL
35. **`_6y1FF`** [ACTION] Whatsapp media message
36. **`_MGMNq`** [ACTION] Generate public file URL
37. **`_nZnXy@1`** [BRANCH_CONDITION] 
38. **`_nZnXy@2`** [BRANCH_CONDITION] 
39. **`_nZnXy@3`** [BRANCH_CONDITION] 
40. **`n_okUs7`** [ACTION] Create variables
41. **`_fv69B`** [ACTION] Whatsapp media message as image
42. **`_F7wmF`** [ACTION] Whatsapp media message
43. **`_BdnNk`** [IF_ELSE] Condition
44. **`_4SUrT`** [IF_ELSE] Condition
45. **`_FatWU`** [IF_ELSE] Condition
46. **`_MXPVi`** [ACTION] Whatsapp media message
47. **`_d6rgE`** [ACTION] Generate public file URL
48. **`_XQn6V`** [ACTION] Whatsapp media message
49. **`_WWS1D`** [ACTION] Generate public file URL
50. **`_jCgns`** [ACTION] Whatsapp media message
51. **`_mzDdq`** [ACTION] Generate public file URL
52. **`_5vHhc`** [ACTION] Whatsapp media message
53. **`_EbKPF`** [ACTION] Whatsapp media message
54. **`_wPyU1`** [ACTION] Whatsapp media message

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `_fYj3J` | START | Trigger interface | `callables_from_interface` | `` | `` | False |
| 2 | `_L2kt0` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 3 | `_zkmyD` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 4 | `_JeZ0a` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 5 | `_CaWgP` | LOOP | For loop | `loop_for_each` | `` | `` | False |
| 6 | `_rvtAo` | BRANCH |  | `` | `` | `` | False |
| 7 | `_rvtAo@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 8 | `_WkqzK` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 9 | `_b94ib` | ACTION | Create UnifyApps file from url | `utility_by_unifyapps_create_unifyapps_fi` | `` | `` | False |
| 10 | `_BzXQ3` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 11 | `_NcS5B` | ACTION | Generate public file URL | `utility_by_unifyapps_generate_public_url` | `` | `` | False |
| 12 | `_fv69B` | ACTION | Whatsapp media message as image | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 13 | `_TW082` | ACTION | Whatsapp media message as image | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 14 | `_zfpRN` | ACTION | Whatsapp media message as image | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 15 | `_rvtAo@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 16 | `_AKWCy` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 17 | `_OqNxF` | ACTION | Create UnifyApps file from url | `utility_by_unifyapps_create_unifyapps_fi` | `` | `` | False |
| 18 | `_olYpA` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 19 | `_MGMNq` | ACTION | Generate public file URL | `utility_by_unifyapps_generate_public_url` | `` | `` | False |
| 20 | `_F7wmF` | ACTION | Whatsapp media message | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 21 | `_6y1FF` | ACTION | Whatsapp media message | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 22 | `_yzLGA` | ACTION | Whatsapp upload file | `insider_conversational_whatsapp_message_` | `` | `` | False |
| 23 | `_rvtAo@3` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 24 | `_On1YX` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 25 | `_MB5Ku` | ACTION | Create UnifyApps file from url | `utility_by_unifyapps_create_unifyapps_fi` | `` | `` | False |
| 26 | `_nZnXy` | BRANCH |  | `` | `` | `` | False |
| 27 | `_nZnXy@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 28 | `_BdnNk` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 29 | `_d6rgE` | ACTION | Generate public file URL | `utility_by_unifyapps_generate_public_url` | `` | `` | False |
| 30 | `_5vHhc` | ACTION | Whatsapp media message | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 31 | `_MXPVi` | ACTION | Whatsapp media message | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 32 | `_nZnXy@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 33 | `_4SUrT` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 34 | `_WWS1D` | ACTION | Generate public file URL | `utility_by_unifyapps_generate_public_url` | `` | `` | False |
| 35 | `_EbKPF` | ACTION | Whatsapp media message | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 36 | `_XQn6V` | ACTION | Whatsapp media message | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 37 | `_nZnXy@3` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 38 | `_FatWU` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 39 | `_mzDdq` | ACTION | Generate public file URL | `utility_by_unifyapps_generate_public_url` | `` | `` | False |
| 40 | `_wPyU1` | ACTION | Whatsapp media message | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 41 | `_jCgns` | ACTION | Whatsapp media message | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 42 | `n_okUs7` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 43 | `_Y1rqA` | ACTION | Whatsapp upload file | `insider_conversational_whatsapp_message_` | `` | `` | False |
| 44 | `_teToi` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 45 | `FVfIV` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 46 | `_jeWKa` | ACTION | Whatsapp message with button reply | `insider_send_conversational_whatsapp_mes` | `` | `` | False |
| 47 | `WiWbx` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 48 | `_ylI4C` | ACTION | Whatsapp message with button reply | `insider_send_conversational_whatsapp_mes` | `` | `` | False |
| 49 | `_7q6c7` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 50 | `_f6MvW` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 51 | `_BOVmW` | LOOP | For loop | `loop_for_each` | `` | `` | False |
| 52 | `_2qxda` | ACTION | Whatsapp media message as image | `insider_send_conversational_whatsapp_med` | `` | `` | False |
| 53 | `_zWtXP` | ACTION | Whatsapp text message | `insider_send_conversational_whatsapp_mes` | `` | `` | False |
| 54 | `_sgPNJ` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 6762c4dac2f4913e6ab8a309.json -->
## Insider Trigger- v1

| Campo | Valor |
|-------|-------|
| **ID** | `6762c4dac2f4913e6ab8a309` |
| **lcName** | insider trigger- v1 |
| **Deploy** | v407 / wf v676 |
| **Definition** | `6a9703665ff6d950aceb8ab8` |
| **Nodos / edges** | 147 / 187 |

### Objetos (`object_type`)
- `amazon_connect_case_id` — nodos: `n_XVlLh`
- `anonymous_users` — nodos: `n_ePw90`, `n_paRzB`, `n_Ec9KA`, `n_axBCC`, `n_dCYdQ`, `n_DcYAX`, `n_xHBwV`
- `belcorp_master_data` — nodos: `n_932g0`
- `belcorp_skill_type` — nodos: `n_Nx7GW`
- `e_ai_agent_conversation_state` — nodos: `n_1jodn`
- `service_hub_case` — nodos: `_szDUt`, `_0KSv6`, `_IWfXx`, `n_iSzRC`, `n_Y8s1t`, `_KyByJ`, `_Lp0h0`, `_ddUgU`, … (+2)

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `2lNNh` | `682dc974e1b22528650c642f` | True |
| `_Z9pa0` | `676db02f0c93231c945eb607` | True |
| `_a4P2Z` | `674afe5adefb851816d61959` | True |
| `_eDXO9` | `67487a0fda695160fbebe499` | True |
| `_kpKJ4` | `675d880d54db1a77c168e65d` | True |
| `_uBAaU` | `676dae390c93231c945e8d7d` | True |
| `n_G1xfN` | `68678c92b1c8535ace0a547e` | False |
| `n_Ru4wP` | `693e98e086c48457515a14d9` | True |
| `n_SmEgF` | `6732f70850384a29acf312fd` | False |
| `n_aTG4E` | `6732f70850384a29acf312fd` | False |
| `n_lF2gs` | `69c17be209f85d3b486955fa` | True |
| `n_ytFWU` | `6a062c5911ab19606b0c7226` | False |
| `pawlj` | `682dc974e1b22528650c642f` | True |

### Publicación al usuario (`conv_ai_by_unifyapps_publish_response`)

- **`_Y3i9s`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _a4P2Z.outputs.caseId }}
- **`n_go3Zk`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _a4P2Z.outputs.caseId }}
- **`n_B6DjQ`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _a4P2Z.outputs.caseId }}
- **`ldzP4`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _a4P2Z.outputs.caseId }}
- **`n_mEgaO`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _a4P2Z.outputs.caseId }}
- **`N0cJK`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _a4P2Z.outputs.caseId }}
- **`3geva`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _a4P2Z.outputs.caseId }}

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`_PRQaz`** [START] New Message
2. **`n_GHEOg`** [IF_ELSE] Condition
3. **`n_wbMPI`** [ACTION] Whatsapp template message *(skip)*
4. **`n_iVkK9`** [ACTION] Execute Groovy code
5. **`_PZf8N`** [IF_ELSE] Condition
6. **`n_G1xfN`** [CALL_WORKFLOW] Call automation → auto `68678c92b1c8535ace0a547e` *(skip)*
7. **`kvxgJ`** [ACTION] Get connection details
8. **`_szDUt`** [ACTION] Fetch records → `service_hub_case`
9. **`n_fPxL2`** [IF_ELSE] Condition
10. **`EF7gN`** [ACTION] Create variables
11. **`n_XVlLh`** [ACTION] Fetch records → `amazon_connect_case_id`
12. **`n_5veNK`** [ACTION] Add response to api stream
13. **`_HcYqo`** [ACTION] Create variables
14. **`n_8d4pL`** [IF_ELSE] Condition
15. **`n_xwjnk`** [ACTION] Create list
16. **`_0KSv6`** [ACTION] Update records by query → `service_hub_case`
17. **`n_L95Fz`** [ACTION] Close a Websocket Connection
18. **`_eqFNZ`** [BRANCH] 
19. **`_WFReE`** [STOP] Stop
20. **`n_kP0BA`** [ACTION] Send Message
21. **`_eqFNZ@1`** [BRANCH_CONDITION] 
22. **`_eqFNZ@2`** [BRANCH_CONDITION] 
23. **`_eqFNZ@3`** [BRANCH_CONDITION] 
24. **`_eqFNZ@4`** [BRANCH_CONDITION] 
25. **`_eqFNZ@5`** [BRANCH_CONDITION] 
26. **`_eqFNZ@7`** [BRANCH_CONDITION] 
27. **`_eqFNZ@8`** [BRANCH_CONDITION] 
28. **`_eqFNZ@9`** [BRANCH_CONDITION] 
29. **`_eqFNZ@10`** [BRANCH_CONDITION] 
30. **`_eqFNZ@11`** [BRANCH_CONDITION] 
31. **`n_YVMZd`** [STOP] Stop
32. **`_8aEXV`** [ACTION] Update variables
33. **`_HH7Nj`** [ACTION] Whatsapp fetch attachment
34. **`_7JVzR`** [ACTION] Whatsapp fetch attachment
35. **`_1cVMi`** [ACTION] Whatsapp fetch attachment
36. **`_QFJ7e`** [ACTION] Whatsapp fetch attachment
37. **`_DC9uR`** [ACTION] Whatsapp fetch attachment
38. **`_bkZ2l`** [ACTION] Serialise object to JSON string
39. **`_eaDln`** [ACTION] Update variables
40. **`_jELcd`** [ACTION] Update variables
41. **`_kO3w8`** [ACTION] Update variables
42. **`_IWfXx`** [ACTION] Fetch records → `service_hub_case`
43. **`_yTWiY`** [ACTION] Execute Groovy code
44. **`_ZhqNd`** [ACTION] Execute Groovy code
45. **`_Mi7ck`** [ACTION] Execute Groovy code
46. **`_rW1NY`** [ACTION] Execute Groovy code
47. **`_v0bGJ`** [ACTION] Speech to text
48. **`_BR1zB`** [ACTION] Update variables
49. **`3ugBZ`** [ACTION] Update variables
50. **`M4TsT`** [IF_ELSE] Condition
51. **`_a4P2Z`** [CALL_WORKFLOW] Call automation → auto `674afe5adefb851816d61959`
52. **`_j6BxW`** [ACTION] Upload file
53. **`_5CDbu`** [ACTION] Upload file
54. **`_qwovY`** [ACTION] Upload file
55. **`_kH96W`** [ACTION] Upload file
56. **`n_exttL`** [ACTION] Execute Groovy code
57. **`_Ie508`** [ACTION] Update variables
58. **`_4DYE0`** [ACTION] Create variables
59. **`lCaNZ`** [IF_ELSE] Condition
60. **`Hne8L`** [ACTION] Update variables
61. **`n_iSzRC`** [ACTION] Fetch records → `service_hub_case`
62. **`_w44Sy`** [ACTION] Generate public file URL
63. **`_VAMg9`** [ACTION] Generate public file URL
64. **`_QBFVE`** [ACTION] Generate public file URL
65. **`_LCupH`** [ACTION] Generate public file URL
66. **`_GFBHc`** [ACTION] Update variables
67. **`lwHOF`** [ACTION] Update variables
68. **`JqNxH`** [ACTION] Update variables
69. **`JF3ej`** [ACTION] Update variables
70. **`n_LgQCP`** [IF_ELSE] Condition
71. **`_sPFeY`** [ACTION] Add item to list
72. **`_OqXCF`** [ACTION] Add item to list
73. **`_EoGKV`** [ACTION] Add item to list
74. **`_fSYvB`** [ACTION] Add item to list
75. **`HqAyN`** [ACTION] Update variables
76. **`_Y3i9s`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
77. **`n_1jodn`** [ACTION] Update records by query → `e_ai_agent_conversation_state`
78. **`_YjWgE`** [ACTION] Update variables
79. **`_QdDCL`** [ACTION] Update variables
80. **`_xGgE9`** [ACTION] Update variables
81. **`_6pnST`** [ACTION] Update variables
82. **`n_lONaR`** [STOP] Stop
83. **`n_9ek9p`** [ACTION] Execute Javascript
84. **`n_wU0ZH`** [IF_ELSE] Condition
85. **`T3Psb`** [IF_ELSE] Condition
86. **`n_8pwNu`** [IF_ELSE] Condition
87. **`1PBCX`** [IF_ELSE] Condition
88. **`ldzP4`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
89. **`n_axBCC`** [ACTION] Fetch records → `anonymous_users`
90. **`n_ePw90`** [ACTION] Fetch records → `anonymous_users`
91. **`_AYmve`** [IF_ELSE] Condition
92. **`n_KvN8V`** [IF_ELSE] Condition
93. **`v26f9`** [STOP] Stop
94. **`n_ms1LR`** [IF_ELSE] Condition
95. **`n_Nsv52`** [IF_ELSE] Condition
96. **`_Lp0h0`** [ACTION] Update records by query → `service_hub_case`
97. **`_KyByJ`** [ACTION] Update records by query → `service_hub_case`
98. **`pawlj`** [CALL_WORKFLOW] Call automation → auto `682dc974e1b22528650c642f`
99. **`n_mEgaO`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
100. **`n_yDJC2`** [IF_ELSE] Condition
101. **`n_Ec9KA`** [ACTION] Update records by query → `anonymous_users`
102. **`n_paRzB`** [ACTION] Create record → `anonymous_users`
103. **`_ddUgU`** [ACTION] Fetch records → `service_hub_case`
104. **`mrsn3`** [IF_ELSE] Condition
105. **`n_5jWJ1`** [STOP] Stop
106. **`n_DcYAX`** [ACTION] Update records by query → `anonymous_users`
107. **`n_dCYdQ`** [ACTION] Create record → `anonymous_users`
108. **`_B2nsV`** [IF_ELSE] Condition
109. **`WuaQz`** [IF_ELSE] Condition
110. **`n_NahPp`** [IF_ELSE] Condition
111. **`n_jJPc5`** [ACTION] Whatsapp template message
112. **`_KM6Rv`** [IF_ELSE] Condition
113. **`_iFXqH`** [ACTION] Update records by query → `service_hub_case`
114. **`LKxdQ`** [STOP] Stop
115. **`N0cJK`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
116. **`n_go3Zk`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
117. **`n_GTE2G`** [ACTION] Whatsapp template message
118. **`n_B6DjQ`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response *(skip)*
119. **`_DvZGz`** [ACTION] Update records by query → `service_hub_case`
120. **`_SoKmw`** [ACTION] Create variables
121. **`n_xHBwV`** [ACTION] Delete records → `anonymous_users` *(skip)*
122. **`n_Y8s1t`** [ACTION] Update records by query → `service_hub_case`
123. **`_eDXO9`** [CALL_WORKFLOW] Call automation → auto `67487a0fda695160fbebe499`
124. **`n_VtHHP`** [STOP] Stop
125. **`_Z9pa0`** [CALL_WORKFLOW] Call automation → auto `676db02f0c93231c945eb607`
126. **`n_Nx7GW`** [ACTION] Fetch records → `belcorp_skill_type`
127. **`_Ox2JE`** [IF_ELSE] Condition
128. **`_HOyVS`** [IF_ELSE] Condition
129. **`_uBAaU`** [CALL_WORKFLOW] Call automation → auto `676dae390c93231c945e8d7d`
130. **`rLBQb`** [IF_ELSE] Condition
131. **`_kpKJ4`** [CALL_WORKFLOW] Call automation → auto `675d880d54db1a77c168e65d`
132. **`n_lCS6i`** [STOP] Respond to automation
133. **`n_932g0`** [ACTION] Fetch records → `belcorp_master_data`
134. **`2lNNh`** [CALL_WORKFLOW] Call automation → auto `682dc974e1b22528650c642f`
135. **`_Yu8mT`** [STOP] Stop
136. **`n_KzCpm`** [IF_ELSE] Condition
137. **`HNcv7`** [IF_ELSE] Condition
138. **`n_Ru4wP`** [CALL_WORKFLOW] Call automation → auto `693e98e086c48457515a14d9`
139. **`n_KkHVA`** [IF_ELSE] Condition
140. **`bMcwH`** [IF_ELSE] Condition
141. **`n_ytFWU`** [CALL_WORKFLOW] Call automation → auto `6a062c5911ab19606b0c7226`
142. **`n_aTG4E`** [CALL_WORKFLOW] Call automation → auto `6732f70850384a29acf312fd`
143. **`n_lF2gs`** [CALL_WORKFLOW] Call automation → auto `69c17be209f85d3b486955fa`
144. **`JFiJe`** [STOP] Stop
145. **`3geva`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
146. **`n_sFiCl`** [IF_ELSE] Condition
147. **`n_SmEgF`** [CALL_WORKFLOW] Call automation → auto `6732f70850384a29acf312fd`

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `_PRQaz` | START | New Message | `insider_on_new_message` | `` | `` | False |
| 2 | `n_GHEOg` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 3 | `n_iVkK9` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 4 | `n_G1xfN` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `68678c92b1c8535ace0a547e` | True |
| 5 | `n_fPxL2` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 6 | `n_5veNK` | ACTION | Add response to api stream | `callables_return_to_api_streaming` | `` | `` | False |
| 7 | `n_wbMPI` | ACTION | Whatsapp template message | `insider_send_conversational_whatsapp_mes` | `` | `` | True |
| 8 | `_PZf8N` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 9 | `_szDUt` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 10 | `n_XVlLh` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `amazon_connect_case_id` | `` | False |
| 11 | `n_8d4pL` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 12 | `n_L95Fz` | ACTION | Close a Websocket Connection | `websocket_close_connection` | `` | `` | False |
| 13 | `n_kP0BA` | ACTION | Send Message | `amazon_connect_send_message` | `` | `` | False |
| 14 | `_0KSv6` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 15 | `_WFReE` | STOP | Stop | `` | `` | `` | False |
| 16 | `kvxgJ` | ACTION | Get connection details | `standard_entities_get_connection_details` | `` | `` | False |
| 17 | `EF7gN` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 18 | `_HcYqo` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 19 | `n_xwjnk` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 20 | `_eqFNZ` | BRANCH |  | `` | `` | `` | False |
| 21 | `_eqFNZ@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 22 | `_8aEXV` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 23 | `_eqFNZ@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 24 | `_HH7Nj` | ACTION | Whatsapp fetch attachment | `insider_whatsapp_fetch_attachment` | `` | `` | False |
| 25 | `_yTWiY` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 26 | `_j6BxW` | ACTION | Upload file | `files_by_unifyapps_upload_file` | `` | `` | False |
| 27 | `_w44Sy` | ACTION | Generate public file URL | `utility_by_unifyapps_generate_public_url` | `` | `` | False |
| 28 | `_sPFeY` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 29 | `_YjWgE` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 30 | `_eqFNZ@3` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 31 | `_7JVzR` | ACTION | Whatsapp fetch attachment | `insider_whatsapp_fetch_attachment` | `` | `` | False |
| 32 | `_ZhqNd` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 33 | `_5CDbu` | ACTION | Upload file | `files_by_unifyapps_upload_file` | `` | `` | False |
| 34 | `_VAMg9` | ACTION | Generate public file URL | `utility_by_unifyapps_generate_public_url` | `` | `` | False |
| 35 | `_OqXCF` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 36 | `_QdDCL` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 37 | `_eqFNZ@4` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 38 | `_1cVMi` | ACTION | Whatsapp fetch attachment | `insider_whatsapp_fetch_attachment` | `` | `` | False |
| 39 | `_Mi7ck` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 40 | `_qwovY` | ACTION | Upload file | `files_by_unifyapps_upload_file` | `` | `` | False |
| 41 | `_QBFVE` | ACTION | Generate public file URL | `utility_by_unifyapps_generate_public_url` | `` | `` | False |
| 42 | `_EoGKV` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 43 | `_xGgE9` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 44 | `_eqFNZ@5` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 45 | `_QFJ7e` | ACTION | Whatsapp fetch attachment | `insider_whatsapp_fetch_attachment` | `` | `` | False |
| 46 | `_rW1NY` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 47 | `_kH96W` | ACTION | Upload file | `files_by_unifyapps_upload_file` | `` | `` | False |
| 48 | `_LCupH` | ACTION | Generate public file URL | `utility_by_unifyapps_generate_public_url` | `` | `` | False |
| 49 | `_fSYvB` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 50 | `_6pnST` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 51 | `_eqFNZ@7` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 52 | `_DC9uR` | ACTION | Whatsapp fetch attachment | `insider_whatsapp_fetch_attachment` | `` | `` | False |
| 53 | `_v0bGJ` | ACTION | Speech to text | `deepgram_speech_to_text` | `` | `` | False |
| 54 | `n_exttL` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 55 | `_GFBHc` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 56 | `HqAyN` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 57 | `_Ie508` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 58 | `_eqFNZ@8` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 59 | `_bkZ2l` | ACTION | Serialise object to JSON string | `utility_by_unifyapps_to_json_string` | `` | `` | False |
| 60 | `_BR1zB` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 61 | `_4DYE0` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 62 | `lwHOF` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 63 | `_eqFNZ@9` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 64 | `_eaDln` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 65 | `3ugBZ` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 66 | `_eqFNZ@10` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 67 | `_jELcd` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 68 | `M4TsT` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 69 | `Hne8L` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 70 | `lCaNZ` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 71 | `JF3ej` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 72 | `JqNxH` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 73 | `_eqFNZ@11` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 74 | `_kO3w8` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 75 | `n_YVMZd` | STOP | Stop | `` | `` | `` | False |
| 76 | `_IWfXx` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 77 | `_a4P2Z` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `674afe5adefb851816d61959` | False |
| 78 | `n_iSzRC` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 79 | `n_LgQCP` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 80 | `_Y3i9s` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 81 | `n_lONaR` | STOP | Stop | `` | `` | `` | False |
| 82 | `n_1jodn` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `e_ai_agent_conversation_state` | `` | False |
| 83 | `n_9ek9p` | ACTION | Execute Javascript | `code_by_unifyapps_javascript` | `` | `` | False |
| 84 | `n_wU0ZH` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 85 | `n_8pwNu` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 86 | `n_ePw90` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `anonymous_users` | `` | False |
| 87 | `n_Nsv52` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 88 | `n_paRzB` | ACTION | Create record | `storage_by_unifyapps_create_record` | `anonymous_users` | `` | False |
| 89 | `n_Ec9KA` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `anonymous_users` | `` | False |
| 90 | `n_axBCC` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `anonymous_users` | `` | False |
| 91 | `n_ms1LR` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 92 | `n_yDJC2` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 93 | `n_dCYdQ` | ACTION | Create record | `storage_by_unifyapps_create_record` | `anonymous_users` | `` | False |
| 94 | `n_jJPc5` | ACTION | Whatsapp template message | `insider_send_conversational_whatsapp_mes` | `` | `` | False |
| 95 | `n_DcYAX` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `anonymous_users` | `` | False |
| 96 | `n_NahPp` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 97 | `n_GTE2G` | ACTION | Whatsapp template message | `insider_send_conversational_whatsapp_mes` | `` | `` | False |
| 98 | `n_go3Zk` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 99 | `n_xHBwV` | ACTION | Delete records | `storage_by_unifyapps_delete_records` | `anonymous_users` | `` | True |
| 100 | `n_B6DjQ` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | True |
| 101 | `n_Y8s1t` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 102 | `n_VtHHP` | STOP | Stop | `` | `` | `` | False |
| 103 | `T3Psb` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 104 | `ldzP4` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 105 | `v26f9` | STOP | Stop | `` | `` | `` | False |
| 106 | `1PBCX` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 107 | `n_KvN8V` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 108 | `n_mEgaO` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 109 | `n_5jWJ1` | STOP | Stop | `` | `` | `` | False |
| 110 | `pawlj` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `682dc974e1b22528650c642f` | False |
| 111 | `mrsn3` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 112 | `WuaQz` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 113 | `N0cJK` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 114 | `LKxdQ` | STOP | Stop | `` | `` | `` | False |
| 115 | `_AYmve` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 116 | `_KyByJ` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 117 | `_Lp0h0` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 118 | `_ddUgU` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 119 | `_B2nsV` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 120 | `_iFXqH` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 121 | `_KM6Rv` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 122 | `_DvZGz` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 123 | `_SoKmw` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 124 | `_eDXO9` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67487a0fda695160fbebe499` | False |
| 125 | `_Z9pa0` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `676db02f0c93231c945eb607` | False |
| 126 | `n_Nx7GW` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_skill_type` | `` | False |
| 127 | `_Ox2JE` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 128 | `_uBAaU` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `676dae390c93231c945e8d7d` | False |
| 129 | `n_lCS6i` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 130 | `_HOyVS` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 131 | `_kpKJ4` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `675d880d54db1a77c168e65d` | False |
| 132 | `rLBQb` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 133 | `2lNNh` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `682dc974e1b22528650c642f` | False |
| 134 | `HNcv7` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 135 | `bMcwH` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 136 | `3geva` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 137 | `JFiJe` | STOP | Stop | `` | `` | `` | False |
| 138 | `n_932g0` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 139 | `n_KzCpm` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 140 | `n_KkHVA` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 141 | `n_lF2gs` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `69c17be209f85d3b486955fa` | False |
| 142 | `n_aTG4E` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6732f70850384a29acf312fd` | False |
| 143 | `n_Ru4wP` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `693e98e086c48457515a14d9` | False |
| 144 | `n_ytFWU` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6a062c5911ab19606b0c7226` | False |
| 145 | `n_sFiCl` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 146 | `n_SmEgF` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6732f70850384a29acf312fd` | False |
| 147 | `_Yu8mT` | STOP | Stop | `` | `` | `` | False |

---

<!-- source: 676dae390c93231c945e8d7d.json -->
## Belcorp | Diamond Consultant

| Campo | Valor |
|-------|-------|
| **ID** | `676dae390c93231c945e8d7d` |
| **lcName** | belcorp | diamond consultant |
| **Deploy** | v19 / wf v38 |
| **Definition** | `6a1f794d031ce35949710c61` |
| **Nodos / edges** | 7 / 7 |

### Objetos (`object_type`)
- `service_hub_case` — nodos: `BvKdV`, `_DvZGz`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `_TEmL5` | `6752da8f6d52326658dd806f` | True |

### Publicación al usuario (`conv_ai_by_unifyapps_publish_response`)

- **`_1n1qP`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _7N1x6.outputs.caseId }}

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`_7N1x6`** [START] Trigger via automation
2. **`BvKdV`** [ACTION] Fetch records → `service_hub_case`
3. **`_DvZGz`** [ACTION] Update records by query → `service_hub_case`
4. **`pItXe`** [IF_ELSE] Condition *(skip)*
5. **`_1n1qP`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response *(skip)*
6. **`_TEmL5`** [CALL_WORKFLOW] Call automation → auto `6752da8f6d52326658dd806f`
7. **`_9K5Hf`** [STOP] Respond to automation

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `_7N1x6` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `BvKdV` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 3 | `_DvZGz` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 4 | `pItXe` | IF_ELSE | Condition | `if_else_condition` | `` | `` | True |
| 5 | `_1n1qP` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | True |
| 6 | `_TEmL5` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6752da8f6d52326658dd806f` | False |
| 7 | `_9K5Hf` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 676db02f0c93231c945eb607.json -->
## Belcorp | Check if diamond consultant

| Campo | Valor |
|-------|-------|
| **ID** | `676db02f0c93231c945eb607` |
| **lcName** | belcorp | check if diamond consultant |
| **Deploy** | v17 / wf v43 |
| **Definition** | `6a205e5861fbe12a0ec1fb0e` |
| **Nodos / edges** | 9 / 10 |

### Objetos (`object_type`)
- `belcorp_diamond_consultants` — nodos: `z1As3`
- `belcorp_skill_type` — nodos: `ZhVM1`, `ZW5A0`, `JX4Vw`

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`_7Otzo`** [START] Trigger via automation
2. **`FHZeI`** [IF_ELSE] Condition
3. **`ZhVM1`** [ACTION] Update records by query → `belcorp_skill_type`
4. **`z1As3`** [ACTION] Fetch records → `belcorp_diamond_consultants`
5. **`Gtqrh`** [STOP] Respond to automation
6. **`3bp1m`** [IF_ELSE] Condition
7. **`JX4Vw`** [ACTION] Update records by query → `belcorp_skill_type`
8. **`ZW5A0`** [ACTION] Update records by query → `belcorp_skill_type`
9. **`NbyDT`** [STOP] Respond to automation

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `_7Otzo` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `FHZeI` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 3 | `ZhVM1` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `belcorp_skill_type` | `` | False |
| 4 | `Gtqrh` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 5 | `z1As3` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_diamond_consultants` | `` | False |
| 6 | `3bp1m` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 7 | `ZW5A0` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `belcorp_skill_type` | `` | False |
| 8 | `JX4Vw` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `belcorp_skill_type` | `` | False |
| 9 | `NbyDT` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 6783284f44ce135db1dab279.json -->
## Prompt Builder

| Campo | Valor |
|-------|-------|
| **ID** | `6783284f44ce135db1dab279` |
| **lcName** | prompt builder |
| **Deploy** | v13 / wf v99 |
| **Definition** | `6a5219d09a308f0d8f0b046f` |
| **Nodos / edges** | 45 / 55 |

### Objetos (`object_type`)
- `e_ai_agent_conversation_state` — nodos: `Rb6C1`
- `e_session_task_state` — nodos: `n_iijN3`
- `e_topic_ai_agent` — nodos: `O0e3K`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `JYICZ` | `67834374fc387b38c73b7972` | True |
| `Tf7vw` | `679629c41a248f0b3415c3b1` | True |
| `XBlQU` | `67d5af775c39266befb87be3` | True |
| `_izuMg` | `68aef17c8b592a6537a56099` | True |
| `n_asgsU` | `6854195c4a0205327f0f4712` | True |
| `n_f1RvF` | `67a48d37f8f1744841dabb63` | True |

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`xInCD`** [START] Trigger via automation
2. **`n_OSuxU`** [ACTION] Create list
3. **`JYICZ`** [CALL_WORKFLOW] Call automation → auto `67834374fc387b38c73b7972`
4. **`n_nSUUP`** [ACTION] Add items to list
5. **`Rb6C1`** [ACTION] Fetch record by ID → `e_ai_agent_conversation_state`
6. **`pe1Mu`** [ACTION] Create list
7. **`sKlj3`** [IF_ELSE] Condition
8. **`Tf7vw`** [CALL_WORKFLOW] Call automation → auto `679629c41a248f0b3415c3b1`
9. **`bRJRV`** [ACTION] Create variables
10. **`x7li5`** [ACTION] Get Session Variables
11. **`3lTtf`** [ACTION] Add item to list
12. **`bsjfs`** [IF_ELSE] Condition
13. **`_vacbD`** [ACTION] Add items to list
14. **`XBlQU`** [CALL_WORKFLOW] Call automation → auto `67d5af775c39266befb87be3` *(skip)*
15. **`9d996`** [IF_ELSE] Condition
16. **`_x8Znw`** [ACTION] Execute Groovy code
17. **`_izuMg`** [CALL_WORKFLOW] Call automation → auto `68aef17c8b592a6537a56099`
18. **`lgGq2`** [ACTION] Create variables
19. **`_n2I2d`** [ACTION] Add item to list
20. **`n_l7zuW`** [ACTION] Add items to list
21. **`htLcj`** [ACTION] Add item to list
22. **`n_LGWc1`** [ACTION] Create variables
23. **`n_7ah94`** [IF_ELSE] Condition
24. **`n_qGMA3`** [ACTION] Create variables
25. **`n_f1RvF`** [CALL_WORKFLOW] Call automation → auto `67a48d37f8f1744841dabb63`
26. **`n_iJ5re`** [IF_ELSE] Condition
27. **`n_AiHv7`** [ACTION] Execute Groovy code
28. **`hd65i`** [STOP] Respond to automation
29. **`n_asgsU`** [CALL_WORKFLOW] Call automation → auto `6854195c4a0205327f0f4712`
30. **`n_U9M1t`** [IF_ELSE] Condition
31. **`n_KxdqB`** [IF_ELSE] Condition
32. **`n_FEnzd`** [ACTION] Update variables
33. **`n_E2dxg`** [IF_ELSE] Condition
34. **`_6kySq`** [ACTION] Update variables
35. **`n_Zf86p`** [ACTION] Update variables
36. **`n_CWEZ5`** [ACTION] Create variables
37. **`n_LpdlL`** [ACTION] Update variables
38. **`n_Fj5Ft`** [IF_ELSE] Condition
39. **`n_yhNyU`** [ACTION] Update variables
40. **`n_iijN3`** [ACTION] Fetch record by ID → `e_session_task_state`
41. **`24f6D`** [IF_ELSE] Condition
42. **`n_PUyIC`** [ACTION] Update variables
43. **`O0e3K`** [ACTION] Fetch records → `e_topic_ai_agent`
44. **`n_8AEV3`** [IF_ELSE] Condition
45. **`n_EScwV`** [ACTION] Update variables

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `xInCD` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `n_OSuxU` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 3 | `JYICZ` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67834374fc387b38c73b7972` | False |
| 4 | `n_nSUUP` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 5 | `Rb6C1` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `e_ai_agent_conversation_state` | `` | False |
| 6 | `pe1Mu` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 7 | `sKlj3` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 8 | `bRJRV` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 9 | `3lTtf` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 10 | `Tf7vw` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `679629c41a248f0b3415c3b1` | False |
| 11 | `x7li5` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 12 | `bsjfs` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 13 | `XBlQU` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67d5af775c39266befb87be3` | True |
| 14 | `_x8Znw` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 15 | `_n2I2d` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 16 | `_vacbD` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 17 | `9d996` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 18 | `lgGq2` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 19 | `htLcj` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 20 | `_izuMg` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `68aef17c8b592a6537a56099` | False |
| 21 | `n_l7zuW` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 22 | `n_LGWc1` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 23 | `n_7ah94` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 24 | `n_f1RvF` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67a48d37f8f1744841dabb63` | False |
| 25 | `n_AiHv7` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 26 | `n_U9M1t` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 27 | `n_E2dxg` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 28 | `n_LpdlL` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 29 | `n_CWEZ5` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 30 | `n_Fj5Ft` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 31 | `n_iijN3` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `e_session_task_state` | `` | False |
| 32 | `n_PUyIC` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 33 | `n_yhNyU` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 34 | `24f6D` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 35 | `O0e3K` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `e_topic_ai_agent` | `` | False |
| 36 | `n_8AEV3` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 37 | `n_EScwV` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 38 | `n_FEnzd` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 39 | `n_qGMA3` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 40 | `n_iJ5re` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 41 | `n_asgsU` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6854195c4a0205327f0f4712` | False |
| 42 | `n_KxdqB` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 43 | `n_Zf86p` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 44 | `_6kySq` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 45 | `hd65i` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 67834374fc387b38c73b7972.json -->
## System Prompt Builder

| Campo | Valor |
|-------|-------|
| **ID** | `67834374fc387b38c73b7972` |
| **lcName** | system prompt builder |
| **Deploy** | v16 / wf v94 |
| **Definition** | `6a5219eb9a308f0d8f0b05ae` |
| **Nodos / edges** | 13 / 13 |

### Objetos (`object_type`)
- `ai_agent` — nodos: `n_tZvNw`
- `service_hub_message` — nodos: `n_vjLXr`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `9dbcQ` | `67e26f9c2807cf04c7f860db` | True |
| `jNHUU` | `67d5ca385c39266befb90a21` | True |
| `n_BLduV` | `{{ n_tZvNw.outputs.properties.preProcessingSettings.systemPromptSetting.addContextAutomationId }}` | True |

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`0WoDm`** [START] Trigger via automation
2. **`9dbcQ`** [CALL_WORKFLOW] Call automation → auto `67e26f9c2807cf04c7f860db`
3. **`n_eOYKQ`** [ACTION] Set Session Variables
4. **`jNHUU`** [CALL_WORKFLOW] Call automation → auto `67d5ca385c39266befb90a21`
5. **`896HW`** [ACTION] Get Session Variables
6. **`n_tZvNw`** [ACTION] Fetch records → `ai_agent`
7. **`n_vjLXr`** [ACTION] Fetch records → `service_hub_message`
8. **`n_G2D9J`** [IF_ELSE] Condition
9. **`MmIks`** [STOP] Respond to automation
10. **`n_fO1cZ`** [ACTION] Execute Groovy code
11. **`n_BLduV`** [CALL_WORKFLOW] Call automation → auto `{{ n_tZvNw.outputs.properties.preProcessingSettings.systemPromptSetting.addContextAutomationId }}`
12. **`n_UcIPe`** [ACTION] Execute Groovy code
13. **`_AnIBs`** [STOP] Respond to automation

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `0WoDm` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `9dbcQ` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67e26f9c2807cf04c7f860db` | False |
| 3 | `n_eOYKQ` | ACTION | Set Session Variables | `variable_by_unifyapps_set_session_variab` | `` | `` | False |
| 4 | `jNHUU` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67d5ca385c39266befb90a21` | False |
| 5 | `896HW` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 6 | `n_tZvNw` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `ai_agent` | `` | False |
| 7 | `n_vjLXr` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message` | `` | False |
| 8 | `n_G2D9J` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 9 | `n_fO1cZ` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 10 | `n_BLduV` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `{{ n_tZvNw.outputs.propertie` | False |
| 11 | `n_UcIPe` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 12 | `_AnIBs` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 13 | `MmIks` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 67850d225384a9541846f5b9.json -->
## Agent Executor 

| Campo | Valor |
|-------|-------|
| **ID** | `67850d225384a9541846f5b9` |
| **lcName** | agent executor  |
| **Deploy** | v37 / wf v160 |
| **Definition** | `6a8f189ba8d03369376cd8ef` |
| **Nodos / edges** | 98 / 121 |

### Objetos (`object_type`)
- `debug_agent` — nodos: `aoQxH`, `_gChqd`, `GbxJx`
- `e_ai_agent_conversation_state` — nodos: `n_29isl`, `_h3gkh`, `Rp3Er`, `_9k1vl`, `KYLEz`, `n_lW4er`
- `e_session_task_state` — nodos: `n_eW0f8`, `n_oZeOz`
- `service_hub_case` — nodos: `rc5xO`, `n_Rmglu`
- `service_hub_message` — nodos: `1GZhm`, `n_wQ0su`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `8GW17` | `67deb8826ff2a8770508424b` | True |
| `FIysl` | `67b4908aaffe713b4ced2d83` | True |
| `In9h9` | `6783284f44ce135db1dab279` | True |
| `MFwMy` | `678511ee5384a9541846fcee` | True |
| `NApos` | `67df12719fa26d792211be4f` | True |
| `_QVOFD` | `698b468d88aff64481e1510f` | False |
| `_eHEzP` | `6851442f9e30586f552a6d73` | True |
| `hxtR4` | `67b43d06948e580ea92513a2` | True |
| `n_5kEJk` | `67a48d37f8f1744841dabb63` | True |
| `n_6OVTS` | `69e5da811925a85918e930f7` | True |
| `n_99RkP` | `67a31b86addac8605df79166` | True |
| `n_Ca7SS` | `68b827559a4a9d0149caa07d` | True |
| `n_DqX6Q` | `698b468d88aff64481e1510f` | True |
| `n_FGxHK` | `6851442f9e30586f552a6d73` | True |
| `n_LtuOX` | `6a062c5911ab19606b0c7226` | True |
| `n_rdYbh` | `698edb1fbd2e947f513f67cf` | False |
| `n_sy0OH` | `67b4908aaffe713b4ced2d83` | True |
| `n_zJeMS` | `6852a59b0904f36d18970206` | False |
| `sWJ66` | `67a31b86addac8605df79166` | True |
| `xuo80` | `67a31b86addac8605df79166` | True |

### Publicación al usuario (`conv_ai_by_unifyapps_publish_response`)

- **`n_vmqLc`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ od8bl.outputs.caseId }}

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`od8bl`** [START] Trigger via automation
2. **`n_lyRnh`** [ACTION] Execute Groovy code
3. **`RckcQ`** [ACTION] Get Session Variables
4. **`n_kxSPM`** [ACTION] Set Session Variables
5. **`QP16Q`** [ACTION] Create variables
6. **`n_J1NYo`** [IF_ELSE] Condition
7. **`n_29isl`** [ACTION] Update an existing record's fields → `e_ai_agent_conversation_state`
8. **`n_eW0f8`** [ACTION] Update an existing record's fields → `e_session_task_state`
9. **`n_UAwqH`** [IF_ELSE] Condition
10. **`In9h9`** [CALL_WORKFLOW] Call automation → auto `6783284f44ce135db1dab279`
11. **`n_LtuOX`** [CALL_WORKFLOW] Call automation → auto `6a062c5911ab19606b0c7226`
12. **`n_Kh1LG`** [ACTION] Create variables
13. **`n_oPwWh`** [IF_ELSE] Condition
14. **`n_FGxHK`** [CALL_WORKFLOW] Call automation → auto `6851442f9e30586f552a6d73`
15. **`n_DqX6Q`** [CALL_WORKFLOW] Call automation → auto `698b468d88aff64481e1510f`
16. **`_QZ3CW`** [ACTION] Update variables
17. **`n_V1O4L`** [IF_ELSE] Condition
18. **`RF77P`** [ACTION] Execute Groovy code
19. **`_eHEzP`** [CALL_WORKFLOW] Call automation → auto `6851442f9e30586f552a6d73`
20. **`n_gjZjI`** [ACTION] Execute Groovy code
21. **`MFwMy`** [CALL_WORKFLOW] Call automation → auto `678511ee5384a9541846fcee`
22. **`n_fHkFb`** [IF_ELSE] Condition
23. **`n_pJ11i`** [ACTION] Update variables
24. **`n_3dPut`** [ACTION] Execute Groovy code
25. **`_hBKvc`** [ACTION] Update variables
26. **`_QVOFD`** [CALL_WORKFLOW] Call automation → auto `698b468d88aff64481e1510f`
27. **`n_rdYbh`** [CALL_WORKFLOW] Call automation → auto `698edb1fbd2e947f513f67cf`
28. **`aoQxH`** [ACTION] Update records by query → `debug_agent` *(skip)*
29. **`n_ssUYI`** [ACTION] Get Session Variables
30. **`n_OmhLe`** [ACTION] Create variables
31. **`rc5xO`** [ACTION] Fetch record by ID → `service_hub_case`
32. **`n_Ijsf0`** [BRANCH] 
33. **`n_Ijsf0@1`** [BRANCH_CONDITION] 
34. **`n_Ijsf0@2`** [BRANCH_CONDITION] 
35. **`xuo80`** [CALL_WORKFLOW] Call automation → auto `67a31b86addac8605df79166`
36. **`n_vmqLc`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
37. **`8GW17`** [CALL_WORKFLOW] Call automation → auto `67deb8826ff2a8770508424b`
38. **`WgrTj`** [ACTION] Update variables
39. **`n_ArM3V`** [ACTION] Create variables
40. **`n_GycoH`** [ACTION] Create variables
41. **`n_sk2k1`** [IF_ELSE] Condition
42. **`n_j1bVu`** [ACTION] Update variables
43. **`n_lW4er`** [ACTION] Fetch record by ID → `e_ai_agent_conversation_state`
44. **`n_oZeOz`** [ACTION] Fetch record by ID → `e_session_task_state`
45. **`n_359Ml`** [ACTION] Update variables
46. **`n_Po1eO`** [ACTION] Update variables
47. **`n_ufBGk`** [ACTION] Update variables
48. **`n_HUMsp`** [IF_ELSE] Condition
49. **`n_5kEJk`** [CALL_WORKFLOW] Call automation → auto `67a48d37f8f1744841dabb63`
50. **`n_Kyv53`** [IF_ELSE] Condition
51. **`n_fl3rd`** [ACTION] Update variables
52. **`Ye3ke`** [IF_ELSE] Condition
53. **`mRevl`** [IF_ELSE] Condition
54. **`n_mLWwI`** [IF_ELSE] Condition
55. **`cHTU1`** [IF_ELSE] Condition
56. **`n_VbiYU`** [IF_ELSE] Condition
57. **`IMlgB`** [IF_ELSE] Condition
58. **`NApos`** [CALL_WORKFLOW] Call automation → auto `67df12719fa26d792211be4f`
59. **`n_wQ0su`** [ACTION] Update an existing record's fields → `service_hub_message`
60. **`1GZhm`** [ACTION] Create record → `service_hub_message`
61. **`n_6OVTS`** [CALL_WORKFLOW] Call automation → auto `69e5da811925a85918e930f7`
62. **`sWJ66`** [CALL_WORKFLOW] Call automation → auto `67a31b86addac8605df79166`
63. **`n_sy0OH`** [CALL_WORKFLOW] Call automation → auto `67b4908aaffe713b4ced2d83`
64. **`n_Ca7SS`** [CALL_WORKFLOW] Call automation → auto `68b827559a4a9d0149caa07d`
65. **`FIysl`** [CALL_WORKFLOW] Call automation → auto `67b4908aaffe713b4ced2d83`
66. **`n_EHL9P`** [ACTION] Update variables
67. **`n_XM3pu`** [IF_ELSE] Condition
68. **`n_NaLB1`** [ACTION] Update variables
69. **`n_69w5p`** [IF_ELSE] Condition
70. **`7IAtb`** [STOP] Respond to automation
71. **`KYLEz`** [ACTION] Update an existing record's fields → `e_ai_agent_conversation_state`
72. **`n_rs3j7`** [ACTION] Execute Groovy code
73. **`n_GDS5y`** [ACTION] Create list
74. **`hxtR4`** [CALL_WORKFLOW] Call automation → auto `67b43d06948e580ea92513a2`
75. **`n_99RkP`** [CALL_WORKFLOW] Call automation → auto `67a31b86addac8605df79166`
76. **`yFOAe`** [STOP] Respond to automation
77. **`n_KNhUq`** [ACTION] Update variables
78. **`n_UTajn`** [ACTION] Execute Groovy code
79. **`R73tS`** [STOP] Respond to automation
80. **`1VCbt`** [IF_ELSE] Condition
81. **`n_rDI6r`** [ACTION] Update variables
82. **`_9k1vl`** [ACTION] Update records by query → `e_ai_agent_conversation_state`
83. **`n_oJEYW`** [IF_ELSE] Condition
84. **`n_GCBxT`** [LOOP] For loop
85. **`GbxJx`** [ACTION] Update records by query → `debug_agent` *(skip)*
86. **`Rp3Er`** [ACTION] Update records by query → `e_ai_agent_conversation_state`
87. **`n_MPh0J`** [STOP] Respond to automation
88. **`n_S7ek7`** [IF_ELSE] Condition
89. **`n_hy0Q2`** [ACTION] Execute Groovy code
90. **`n_Rmglu`** [ACTION] Fetch record by ID → `service_hub_case`
91. **`n_iSpSU`** [ACTION] Wait for signals
92. **`n_zJeMS`** [CALL_WORKFLOW] Call automation → auto `6852a59b0904f36d18970206`
93. **`n_O9nze`** [ACTION] Set Session Variables
94. **`n_1Lv0S`** [ACTION] Add item to list
95. **`n_9Jm8I`** [LOOP] For loop
96. **`_R1dmZ`** [IF_ELSE] Condition
97. **`_gChqd`** [ACTION] Update records by query → `debug_agent` *(skip)*
98. **`_h3gkh`** [ACTION] Update records by query → `e_ai_agent_conversation_state`

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `od8bl` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `n_lyRnh` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 3 | `RckcQ` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 4 | `n_kxSPM` | ACTION | Set Session Variables | `variable_by_unifyapps_set_session_variab` | `` | `` | False |
| 5 | `QP16Q` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 6 | `n_J1NYo` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 7 | `n_eW0f8` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `e_session_task_state` | `` | False |
| 8 | `n_29isl` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `e_ai_agent_conversation_state` | `` | False |
| 9 | `n_UAwqH` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 10 | `n_LtuOX` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6a062c5911ab19606b0c7226` | False |
| 11 | `In9h9` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6783284f44ce135db1dab279` | False |
| 12 | `n_Kh1LG` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 13 | `n_oPwWh` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 14 | `n_DqX6Q` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `698b468d88aff64481e1510f` | False |
| 15 | `n_V1O4L` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 16 | `n_gjZjI` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 17 | `n_pJ11i` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 18 | `n_rdYbh` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `698edb1fbd2e947f513f67cf` | False |
| 19 | `_eHEzP` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6851442f9e30586f552a6d73` | False |
| 20 | `n_fHkFb` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 21 | `_QVOFD` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `698b468d88aff64481e1510f` | False |
| 22 | `_hBKvc` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 23 | `n_FGxHK` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6851442f9e30586f552a6d73` | False |
| 24 | `_QZ3CW` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 25 | `RF77P` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 26 | `MFwMy` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `678511ee5384a9541846fcee` | False |
| 27 | `n_3dPut` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 28 | `aoQxH` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `debug_agent` | `` | True |
| 29 | `n_ssUYI` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 30 | `n_OmhLe` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 31 | `rc5xO` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `service_hub_case` | `` | False |
| 32 | `n_Ijsf0` | BRANCH |  | `` | `` | `` | False |
| 33 | `n_Ijsf0@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 34 | `n_vmqLc` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 35 | `n_Ijsf0@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 36 | `8GW17` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67deb8826ff2a8770508424b` | False |
| 37 | `n_GycoH` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 38 | `n_j1bVu` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 39 | `n_359Ml` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 40 | `n_HUMsp` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 41 | `n_fl3rd` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 42 | `n_Kyv53` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 43 | `n_mLWwI` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 44 | `1GZhm` | ACTION | Create record | `storage_by_unifyapps_create_record` | `service_hub_message` | `` | False |
| 45 | `n_NaLB1` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 46 | `n_wQ0su` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_message` | `` | False |
| 47 | `n_XM3pu` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 48 | `n_GDS5y` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 49 | `n_UTajn` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 50 | `n_rDI6r` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 51 | `n_GCBxT` | LOOP | For loop | `loop_for_each` | `` | `` | False |
| 52 | `n_hy0Q2` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 53 | `n_zJeMS` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6852a59b0904f36d18970206` | False |
| 54 | `n_1Lv0S` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 55 | `n_S7ek7` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 56 | `n_iSpSU` | ACTION | Wait for signals | `signals_by_unifyapps_wait_for_signals` | `` | `` | False |
| 57 | `n_Rmglu` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `service_hub_case` | `` | False |
| 58 | `n_O9nze` | ACTION | Set Session Variables | `variable_by_unifyapps_set_session_variab` | `` | `` | False |
| 59 | `n_9Jm8I` | LOOP | For loop | `loop_for_each` | `` | `` | False |
| 60 | `_R1dmZ` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 61 | `_h3gkh` | ACTION | Update records by query | `storage_by_unifyapps_update_record_field` | `e_ai_agent_conversation_state` | `` | False |
| 62 | `_gChqd` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `debug_agent` | `` | True |
| 63 | `mRevl` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 64 | `NApos` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67df12719fa26d792211be4f` | False |
| 65 | `n_EHL9P` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 66 | `n_rs3j7` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 67 | `n_KNhUq` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 68 | `1VCbt` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 69 | `n_oJEYW` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 70 | `n_MPh0J` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 71 | `Rp3Er` | ACTION | Update records by query | `storage_by_unifyapps_update_record_field` | `e_ai_agent_conversation_state` | `` | False |
| 72 | `_9k1vl` | ACTION | Update records by query | `storage_by_unifyapps_update_record_field` | `e_ai_agent_conversation_state` | `` | False |
| 73 | `GbxJx` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `debug_agent` | `` | True |
| 74 | `IMlgB` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 75 | `FIysl` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67b4908aaffe713b4ced2d83` | False |
| 76 | `KYLEz` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `e_ai_agent_conversation_state` | `` | False |
| 77 | `yFOAe` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 78 | `xuo80` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67a31b86addac8605df79166` | False |
| 79 | `WgrTj` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 80 | `n_ArM3V` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 81 | `n_sk2k1` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 82 | `n_oZeOz` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `e_session_task_state` | `` | False |
| 83 | `n_ufBGk` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 84 | `n_lW4er` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `e_ai_agent_conversation_state` | `` | False |
| 85 | `n_Po1eO` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 86 | `n_5kEJk` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67a48d37f8f1744841dabb63` | False |
| 87 | `Ye3ke` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 88 | `n_VbiYU` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 89 | `n_sy0OH` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67b4908aaffe713b4ced2d83` | False |
| 90 | `n_Ca7SS` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `68b827559a4a9d0149caa07d` | False |
| 91 | `7IAtb` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 92 | `cHTU1` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 93 | `sWJ66` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67a31b86addac8605df79166` | False |
| 94 | `n_6OVTS` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `69e5da811925a85918e930f7` | False |
| 95 | `n_69w5p` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 96 | `n_99RkP` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67a31b86addac8605df79166` | False |
| 97 | `hxtR4` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67b43d06948e580ea92513a2` | False |
| 98 | `R73tS` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 679629c41a248f0b3415c3b1.json -->
## User/Assistant Prompt Builder

| Campo | Valor |
|-------|-------|
| **ID** | `679629c41a248f0b3415c3b1` |
| **lcName** | user/assistant prompt builder |
| **Deploy** | v63 / wf v198 |
| **Definition** | `6a8f5bc0a8396d209845f404` |
| **Nodos / edges** | 160 / 209 |

### Objetos (`object_type`)
- `belcorp_master_data` — nodos: `n_j8wWL`
- `case_summary_checkpoint` — nodos: `n_gV7On`
- `claim_registry` — nodos: `n_cVTgx`
- `e_ai_agent_conversation_state` — nodos: `zx1QI`
- `e_session_task_state` — nodos: `n_tgPvh`
- `service_hub_case` — nodos: `n_D6NDh`
- `service_hub_message` — nodos: `MLflq`
- `service_hub_message_tool_use_detail` — nodos: `n_zi2hF`, `n_c1XL9`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `KrMQT` | `67e2d58d94875751e6bc1066` | True |
| `UkaLa` | `682c6f948d04422e007feda1` | True |
| `_H6CEX` | `691763ae1f8f65562e7a10d2` | True |
| `_ib3fp` | `691763ae1f8f65562e7a10d2` | True |
| `n_FgALu` | `68540730b0b2635694de2c80` | True |
| `n_K6w25` | `66e598f208d0f101e7cd4734` | True |
| `n_M3hNm` | `6914add8b7d5915df57d4453` | False |
| `n_jPNhA` | `67a48d37f8f1744841dabb63` | True |
| `n_mqUJH` | `69175684f233da43e9f76dd5` | True |

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`PPF3R`** [START] Trigger via automation
2. **`_r8Vof`** [ACTION] Create variables
3. **`bO6OR`** [IF_ELSE] Condition
4. **`n_jRSPu`** [ACTION] Update variables
5. **`zx1QI`** [ACTION] Fetch records → `e_ai_agent_conversation_state`
6. **`n_jPNhA`** [CALL_WORKFLOW] Call automation → auto `67a48d37f8f1744841dabb63`
7. **`OWCLS`** [ACTION] Update variables
8. **`_ko6Sj`** [ACTION] Update variables
9. **`KrMQT`** [CALL_WORKFLOW] Call automation → auto `67e2d58d94875751e6bc1066`
10. **`pe1Mu`** [ACTION] Create list
11. **`_INNnu`** [ACTION] Create list
12. **`_fkKCh`** [ACTION] Create list
13. **`n_xGfOm`** [ACTION] Create list
14. **`n_D6NDh`** [ACTION] Fetch records → `service_hub_case`
15. **`n_pqXM3`** [IF_ELSE] Condition
16. **`_edCXr`** [ACTION] Execute Groovy code
17. **`n_tgPvh`** [ACTION] Fetch record by ID → `e_session_task_state`
18. **`MLflq`** [ACTION] Fetch records → `service_hub_message`
19. **`UkaLa`** [CALL_WORKFLOW] Call automation → auto `682c6f948d04422e007feda1`
20. **`n_is3Lv`** [ACTION] Get Session Variables
21. **`n_DH16n`** [ACTION] Create variables
22. **`n_IDxlC`** [ACTION] Create list
23. **`n_UAwqH`** [IF_ELSE] Condition
24. **`n_BDjaG`** [ACTION] Execute Groovy code
25. **`n_j8wWL`** [ACTION] Fetch records → `belcorp_master_data`
26. **`n_LmxIf`** [IF_ELSE] Condition
27. **`n_cVTgx`** [ACTION] Fetch records → `claim_registry`
28. **`n_tvHbr`** [ACTION] Execute Groovy code
29. **`n_mqUJH`** [CALL_WORKFLOW] Get Case Summary → auto `69175684f233da43e9f76dd5`
30. **`n_2Ajo0`** [IF_ELSE] Condition
31. **`n_K6w25`** [CALL_WORKFLOW] Call automation → auto `66e598f208d0f101e7cd4734`
32. **`n_gV7On`** [ACTION] Fetch record by ID → `case_summary_checkpoint`
33. **`n_3SbmW`** [ACTION] Update variables
34. **`n_zi2hF`** [ACTION] Fetch records → `service_hub_message_tool_use_detail`
35. **`n_szCkk`** [IF_ELSE] Condition
36. **`n_lzCbD`** [LOOP] For each loop
37. **`n_FgALu`** [CALL_WORKFLOW] Call automation → auto `68540730b0b2635694de2c80`
38. **`n_f2QM8`** [ACTION] Update variables
39. **`n_Rt4Qq`** [ACTION] Update variables
40. **`n_liacJ`** [ACTION] Serialise object to JSON string
41. **`n_kemXO`** [ACTION] Add item to list
42. **`kgcmN`** [LOOP] For loop
43. **`_6mDLY`** [ACTION] Execute Groovy code
44. **`n_fvsIM`** [ACTION] Remove all items from list
45. **`n_b52QE`** [IF_ELSE] Condition
46. **`n_oeaRT`** [BREAK] Break
47. **`RjB1U`** [IF_ELSE] Condition
48. **`n_Xy2yO`** [IF_ELSE] Condition
49. **`_l2gOP`** [ACTION] Execute Groovy code
50. **`6uxFX`** [ACTION] Execute Groovy code
51. **`OValh`** [ACTION] Add items to list
52. **`_pJbrN`** [ACTION] Execute Groovy code
53. **`n_qSBWA`** [IF_ELSE] Condition
54. **`n_XX1nF`** [ACTION] Execute Groovy code
55. **`n_cIyxi`** [IF_ELSE] Condition
56. **`_WbPq6`** [IF_ELSE] Condition
57. **`_YbmVz`** [IF_ELSE] Condition
58. **`_Pe2g8`** [ACTION] Execute Groovy code
59. **`E7OwA`** [ACTION] Execute Groovy code
60. **`n_XZnPo`** [ACTION] Create variables
61. **`n_M3hNm`** [CALL_WORKFLOW] Call automation → auto `6914add8b7d5915df57d4453`
62. **`_4DL80`** [ACTION] Update variables
63. **`_H6CEX`** [CALL_WORKFLOW] Call automation → auto `691763ae1f8f65562e7a10d2`
64. **`_vgq0t`** [IF_ELSE] Condition
65. **`n_og58O`** [ACTION] Update variables
66. **`DMb2V`** [ACTION] Execute Groovy code
67. **`_sVKe5`** [ACTION] Add item to list
68. **`_fv0aI`** [ACTION] Update variables
69. **`_YecS0`** [ACTION] Execute Groovy code
70. **`3A1nC`** [IF_ELSE] Condition
71. **`n_7BYej`** [ACTION] Update variables
72. **`_iwZ4E`** [IF_ELSE] Condition
73. **`n_gFnr2`** [ACTION] Create list
74. **`n_1iUrG`** [IF_ELSE] Condition
75. **`n_jTzvF`** [ACTION] Set Session Variables
76. **`_vskhk`** [ACTION] Update variables
77. **`n_lJJJt`** [IF_ELSE] Condition
78. **`n_gmkIT`** [IF_ELSE] Condition
79. **`UMfmT`** [ACTION] Convert HTML to text *(skip)*
80. **`n_VQSUw`** [IF_ELSE] Condition
81. **`_ZOm2Q`** [ACTION] Add item to list
82. **`zFyPX`** [ACTION] Execute Groovy code
83. **`n_HWlNe`** [ACTION] Execute Groovy code
84. **`_nKMwJ`** [ACTION] Update variables
85. **`_lPykW`** [ACTION] Create list
86. **`78rsa`** [STOP] Respond to automation
87. **`n_Bidub`** [ACTION] Execute Groovy code
88. **`IKgYH`** [IF_ELSE] Condition
89. **`n_c1XL9`** [ACTION] Fetch records → `service_hub_message_tool_use_detail` *(skip)*
90. **`n_08NQf`** [ACTION] Execute Groovy code
91. **`n_5euip`** [ACTION] Update variables
92. **`GAKwj`** [IF_ELSE] Condition
93. **`n_s0LcK`** [ACTION] Add item to list
94. **`n_ecTJc`** [ACTION] Add items to list
95. **`n_Z3tMw`** [ACTION] Execute Groovy code
96. **`_gdHW3`** [ACTION] Execute Groovy code
97. **`n_KfFB4`** [ACTION] Add item to list
98. **`0Cbyc`** [IF_ELSE] Condition
99. **`n_yRWOM`** [ACTION] Remove all items from list
100. **`8wBWX`** [LOOP] For loop
101. **`Sh4mp`** [ACTION] Add item to list
102. **`n_OTLYp`** [IF_ELSE] Condition
103. **`n_Z2hYT`** [IF_ELSE] Condition
104. **`7jEcB`** [BRANCH] 
105. **`_cot9S`** [ACTION] Add items to list
106. **`n_5KAVP`** [LOOP] For each loop
107. **`lEf1N`** [IF_ELSE] Condition
108. **`n_AHz3f`** [ACTION] Add item to list
109. **`7jEcB@1`** [BRANCH_CONDITION] 
110. **`7jEcB@2`** [BRANCH_CONDITION] 
111. **`7jEcB@3`** [BRANCH_CONDITION] 
112. **`7jEcB@4`** [BRANCH_CONDITION] 
113. **`7jEcB@5`** [BRANCH_CONDITION] 
114. **`7jEcB@6`** [BRANCH_CONDITION] 
115. **`n_zTX2C`** [ACTION] Create variables
116. **`_5c62W`** [IF_ELSE] Condition
117. **`n_4jBjy`** [ACTION] Remove all items from list
118. **`xjLwT`** [ACTION] Add item to list
119. **`_D92VV`** [IF_ELSE] Condition
120. **`n_a5hCw`** [IF_ELSE] Condition
121. **`IUwLu`** [ACTION] Add item to list
122. **`wd839`** [ACTION] Add item to list
123. **`n_4hwoq`** [ACTION] Execute Groovy code
124. **`_CFlMl`** [ACTION] Add item to list
125. **`n_pvQlb`** [IF_ELSE] Condition
126. **`_YAYuB`** [ACTION] Serialise object to JSON string
127. **`n_ghqkv`** [LOOP] For each loop
128. **`_WMmOD`** [ACTION] Add item to list
129. **`_7UmuU`** [ACTION] Add item to list
130. **`DG1RY`** [ACTION] Add item to list
131. **`n_nreAt`** [ACTION] Add item to list
132. **`n_3xXqN`** [IF_ELSE] Condition
133. **`n_4fFgU`** [IF_ELSE] Condition
134. **`_ADXuU`** [ACTION] Execute Groovy code
135. **`_DTajF`** [ACTION] Execute Groovy code
136. **`n_5Kf6z`** [ACTION] Add item to list
137. **`n_8Ilf6`** [IF_ELSE] Condition
138. **`_qFeQg`** [ACTION] Execute Groovy code
139. **`_kjpq3`** [ACTION] Add items to list
140. **`n_IX6By`** [IF_ELSE] Condition
141. **`_JZo2n`** [ACTION] Update variables
142. **`_iZ69R`** [ACTION] Add item to list
143. **`n_xB0wv`** [ACTION] Convert JSON to TOON
144. **`_TAHzd`** [ACTION] Add item to list
145. **`_RBSSS`** [ACTION] Execute Groovy code
146. **`n_A2bvg`** [IF_ELSE] Condition
147. **`n_UEVFb`** [ACTION] Update variables
148. **`_tzLNv`** [ACTION] Add item to list
149. **`_0NiP7`** [ACTION] Add items to list
150. **`_BAWo6`** [ACTION] Execute Groovy code
151. **`n_r0pYr`** [ACTION] Add item to list
152. **`n_SUvZi`** [ACTION] Update variables
153. **`_Eo89c`** [ACTION] Update variables
154. **`_EYabr`** [IF_ELSE] Condition
155. **`_rxclB`** [IF_ELSE] Condition
156. **`_KNUx1`** [IF_ELSE] Condition
157. **`_ib3fp`** [CALL_WORKFLOW] Call automation → auto `691763ae1f8f65562e7a10d2`
158. **`_aTWwL`** [ACTION] Add items to list
159. **`_bezn1`** [ACTION] Update variables
160. **`_O6YqL`** [ACTION] Update variables

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `PPF3R` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `_r8Vof` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 3 | `bO6OR` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 4 | `zx1QI` | ACTION | Fetch records | `storage_by_unifyapps_get_record_by_id` | `e_ai_agent_conversation_state` | `` | False |
| 5 | `OWCLS` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 6 | `n_jRSPu` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 7 | `n_jPNhA` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67a48d37f8f1744841dabb63` | False |
| 8 | `_ko6Sj` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 9 | `KrMQT` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67e2d58d94875751e6bc1066` | False |
| 10 | `pe1Mu` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 11 | `_INNnu` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 12 | `_fkKCh` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 13 | `n_xGfOm` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 14 | `n_D6NDh` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 15 | `n_pqXM3` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 16 | `n_tgPvh` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `e_session_task_state` | `` | False |
| 17 | `_edCXr` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 18 | `MLflq` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message` | `` | False |
| 19 | `UkaLa` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `682c6f948d04422e007feda1` | False |
| 20 | `n_is3Lv` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 21 | `n_DH16n` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 22 | `n_IDxlC` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 23 | `n_UAwqH` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 24 | `n_j8wWL` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 25 | `n_cVTgx` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `claim_registry` | `` | False |
| 26 | `n_2Ajo0` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 27 | `n_3SbmW` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 28 | `n_lzCbD` | LOOP | For each loop | `loop_for_each` | `` | `` | False |
| 29 | `n_kemXO` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 30 | `n_liacJ` | ACTION | Serialise object to JSON string | `utility_by_unifyapps_to_json_string` | `` | `` | False |
| 31 | `n_BDjaG` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 32 | `n_LmxIf` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 33 | `n_mqUJH` | CALL_WORKFLOW | Get Case Summary | `callables_call_automation` | `` | `69175684f233da43e9f76dd5` | False |
| 34 | `n_gV7On` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `case_summary_checkpoint` | `` | False |
| 35 | `n_szCkk` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 36 | `n_Rt4Qq` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 37 | `n_f2QM8` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 38 | `n_tvHbr` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 39 | `n_K6w25` | CALL_WORKFLOW | Call automation | `callables_call_automation_batch` | `` | `66e598f208d0f101e7cd4734` | False |
| 40 | `n_zi2hF` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message_tool_use_detail` | `` | False |
| 41 | `n_FgALu` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `68540730b0b2635694de2c80` | False |
| 42 | `kgcmN` | LOOP | For loop | `loop_for_each` | `` | `` | False |
| 43 | `n_fvsIM` | ACTION | Remove all items from list | `variable_by_unifyapps_clear_list` | `` | `` | False |
| 45 | `_l2gOP` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 46 | `n_XX1nF` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 47 | `E7OwA` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 48 | `n_og58O` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 49 | `3A1nC` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 50 | `n_1iUrG` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 51 | `n_gmkIT` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 52 | `_nKMwJ` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 53 | `UMfmT` | ACTION | Convert HTML to text | `utility_by_unifyapps_from_html_to_plain_` | `` | `` | True |
| 54 | `_lPykW` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 55 | `n_08NQf` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 56 | `n_Z3tMw` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 57 | `0Cbyc` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 58 | `Sh4mp` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 59 | `8wBWX` | LOOP | For loop | `loop_for_each` | `` | `` | False |
| 60 | `7jEcB` | BRANCH |  | `` | `` | `` | False |
| 61 | `7jEcB@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 62 | `_D92VV` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 63 | `_7UmuU` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 64 | `_WMmOD` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 65 | `7jEcB@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 66 | `n_a5hCw` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 67 | `n_nreAt` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 68 | `DG1RY` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 69 | `7jEcB@3` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 70 | `IUwLu` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 71 | `7jEcB@4` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 72 | `wd839` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 73 | `7jEcB@5` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 74 | `n_4hwoq` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 75 | `n_3xXqN` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 76 | `_qFeQg` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 77 | `_TAHzd` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 78 | `7jEcB@6` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 79 | `_CFlMl` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 80 | `n_zTX2C` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 81 | `n_Z2hYT` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 82 | `n_AHz3f` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 83 | `lEf1N` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 84 | `xjLwT` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 85 | `n_gFnr2` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 86 | `n_lJJJt` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 87 | `n_HWlNe` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 88 | `n_c1XL9` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message_tool_use_detail` | `` | True |
| 89 | `n_ecTJc` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 90 | `zFyPX` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 91 | `IKgYH` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 92 | `n_s0LcK` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 93 | `GAKwj` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 94 | `n_KfFB4` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 95 | `_gdHW3` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 96 | `n_yRWOM` | ACTION | Remove all items from list | `variable_by_unifyapps_clear_list` | `` | `` | False |
| 97 | `n_OTLYp` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 98 | `n_5KAVP` | LOOP | For each loop | `loop_for_each` | `` | `` | False |
| 99 | `n_4jBjy` | ACTION | Remove all items from list | `variable_by_unifyapps_clear_list` | `` | `` | False |
| 100 | `n_ghqkv` | LOOP | For each loop | `loop_for_each` | `` | `` | False |
| 101 | `n_8Ilf6` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 102 | `n_xB0wv` | ACTION | Convert JSON to TOON | `utility_by_unifyapps_convert_json_to_too` | `` | `` | False |
| 103 | `n_UEVFb` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 104 | `n_r0pYr` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 105 | `_tzLNv` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 106 | `_iZ69R` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 107 | `n_5Kf6z` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 108 | `_cot9S` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 109 | `_5c62W` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 110 | `_YAYuB` | ACTION | Serialise object to JSON string | `utility_by_unifyapps_to_json_string` | `` | `` | False |
| 111 | `_DTajF` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 112 | `_JZo2n` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 113 | `n_A2bvg` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 114 | `_BAWo6` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 115 | `_Eo89c` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 116 | `_EYabr` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 117 | `_KNUx1` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 118 | `_bezn1` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 119 | `_aTWwL` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 120 | `_rxclB` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 121 | `_ib3fp` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `691763ae1f8f65562e7a10d2` | False |
| 122 | `_O6YqL` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 123 | `n_pvQlb` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 124 | `_ADXuU` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 125 | `n_IX6By` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 126 | `_RBSSS` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 127 | `_0NiP7` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 128 | `n_SUvZi` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 129 | `n_4fFgU` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 130 | `_kjpq3` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 131 | `_6mDLY` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 132 | `n_b52QE` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 133 | `n_Xy2yO` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 134 | `n_qSBWA` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 135 | `_Pe2g8` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 136 | `_vgq0t` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 137 | `_YecS0` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 138 | `_iwZ4E` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 139 | `_vskhk` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 140 | `_ZOm2Q` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 141 | `_pJbrN` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 142 | `_WbPq6` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 143 | `_4DL80` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 144 | `_sVKe5` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 145 | `_YbmVz` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 146 | `_H6CEX` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `691763ae1f8f65562e7a10d2` | False |
| 147 | `_fv0aI` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 148 | `RjB1U` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 149 | `OValh` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 150 | `6uxFX` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 151 | `n_cIyxi` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 152 | `n_M3hNm` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6914add8b7d5915df57d4453` | False |
| 153 | `n_XZnPo` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 154 | `DMb2V` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 155 | `n_7BYej` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 156 | `n_jTzvF` | ACTION | Set Session Variables | `variable_by_unifyapps_set_session_variab` | `` | `` | False |
| 157 | `n_VQSUw` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 158 | `n_Bidub` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 159 | `n_5euip` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 160 | `78rsa` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 67d5ca385c39266befb90a21.json -->
## Model Based System Prompt Builder

| Campo | Valor |
|-------|-------|
| **ID** | `67d5ca385c39266befb90a21` |
| **lcName** | model based system prompt builder |
| **Deploy** | v13 / wf v122 |
| **Definition** | `6a5219a59a308f0d8f0b029d` |
| **Nodos / edges** | 29 / 32 |

### Objetos (`object_type`)
- `agent_instruction` — nodos: `n_eMzCI`
- `e_ai_agent_conversation_state` — nodos: `cOsMz`
- `pii_redaction` — nodos: `n_DeFu5`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `15DQp` | `67a48d37f8f1744841dabb63` | True |
| `d2ytg` | `67e2d58d94875751e6bc1066` | True |

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`a5oLe`** [START] Trigger via automation
2. **`I7gor`** [ACTION] Get Session Variables
3. **`pamSx`** [ACTION] Create variables
4. **`d2ytg`** [CALL_WORKFLOW] Call automation → auto `67e2d58d94875751e6bc1066`
5. **`WUqvw`** [ACTION] Create variables
6. **`cOsMz`** [ACTION] Fetch record by ID → `e_ai_agent_conversation_state`
7. **`vfrGK`** [IF_ELSE] Condition
8. **`n_FFxnE`** [ACTION] Compile template
9. **`15DQp`** [CALL_WORKFLOW] Call automation → auto `67a48d37f8f1744841dabb63`
10. **`n_QB8Z0`** [ACTION] Compile template
11. **`9nT76`** [ACTION] Compile template
12. **`n_vXbd4`** [ACTION] Compile template
13. **`MrtZw`** [ACTION] Update variables
14. **`n_nvOTn`** [ACTION] Compile template
15. **`BC7T2`** [ACTION] Get Session Variables
16. **`n_DeFu5`** [ACTION] Fetch records → `pii_redaction`
17. **`iRc9d`** [IF_ELSE] Condition
18. **`n_JC7uK`** [IF_ELSE] Condition
19. **`xKlOV`** [ACTION] Update variables
20. **`tjJ53`** [ACTION] Update variables
21. **`n_laPlE`** [ACTION] Execute Groovy code
22. **`n_5VEi9`** [ACTION] Execute Groovy code
23. **`n_GxqCo`** [IF_ELSE] Condition
24. **`_q0vFd`** [ACTION] Compile template
25. **`mgYAY`** [STOP] Respond to automation
26. **`n_KObfr`** [ACTION] Update variables
27. **`n_eMzCI`** [ACTION] Fetch records → `agent_instruction`
28. **`_uK4Qp`** [ACTION] Compile template
29. **`_7zO2p`** [ACTION] Update variables

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `a5oLe` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `I7gor` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 3 | `pamSx` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 4 | `d2ytg` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67e2d58d94875751e6bc1066` | False |
| 5 | `WUqvw` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 6 | `cOsMz` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `e_ai_agent_conversation_state` | `` | False |
| 7 | `vfrGK` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 8 | `15DQp` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67a48d37f8f1744841dabb63` | False |
| 9 | `9nT76` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 10 | `MrtZw` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 11 | `n_FFxnE` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 12 | `n_QB8Z0` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 13 | `n_vXbd4` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 14 | `n_nvOTn` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 15 | `n_DeFu5` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `pii_redaction` | `` | False |
| 16 | `n_JC7uK` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 17 | `n_5VEi9` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 18 | `n_laPlE` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 19 | `_q0vFd` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 20 | `n_eMzCI` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `agent_instruction` | `` | False |
| 21 | `_uK4Qp` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 22 | `_7zO2p` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 23 | `BC7T2` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 24 | `iRc9d` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 25 | `tjJ53` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 26 | `xKlOV` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 27 | `n_GxqCo` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 28 | `n_KObfr` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 29 | `mgYAY` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 67e26f9c2807cf04c7f860db.json -->
## Get Agent Tools and Attributes

| Campo | Valor |
|-------|-------|
| **ID** | `67e26f9c2807cf04c7f860db` |
| **lcName** | get agent tools and attributes |
| **Deploy** | v13 / wf v47 |
| **Definition** | `6a5219cd9a308f0d8f0b0437` |
| **Nodos / edges** | 44 / 54 |

### Objetos (`object_type`)
- `ai_agent_llm_model` — nodos: `n_kWQLa`
- `e_ai_agent_conversation_state` — nodos: `CVd2b`, `n_sp6BC`
- `e_session_task_state` — nodos: `n_bNpOV`
- `e_topic_ai_agent` — nodos: `O0e3K`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `_ETxAw` | `67ce5eefdd8cc819cebcc949` | True |
| `bvAH5` | `67e250ffb174fc3bd7e99420` | True |
| `eDsrj` | `682c17038bb4a0449efc9ec9` | True |
| `n_RhBIP` | `6a227596c0911a1a0e133f35` | True |
| `n_ToOVH` | `6970a524648686730e1c9793` | True |
| `n_WI3dW` | `67a48d37f8f1744841dabb63` | True |

### Otras interfaces callable
- `jgdBf` → `6794741f9c8ab5620dca8a02` (callables_call_interface)

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`0WoDm`** [START] Trigger via automation
2. **`53LAF`** [ACTION] Get Session Variables
3. **`n_WI3dW`** [CALL_WORKFLOW] Call automation → auto `67a48d37f8f1744841dabb63`
4. **`iNEXV`** [ACTION] Create list
5. **`jgdBf`** [CALL_WORKFLOW] Call interface
6. **`n_RpDhm`** [ACTION] Add items to list
7. **`CVd2b`** [ACTION] Fetch record by ID → `e_ai_agent_conversation_state`
8. **`n_CWEZ5`** [ACTION] Create variables
9. **`n_Fj5Ft`** [IF_ELSE] Condition
10. **`n_yhNyU`** [ACTION] Update variables
11. **`n_bNpOV`** [ACTION] Fetch record by ID → `e_session_task_state`
12. **`24f6D`** [IF_ELSE] Condition
13. **`n_PUyIC`** [ACTION] Update variables
14. **`_XnYkm`** [IF_ELSE] Condition
15. **`O0e3K`** [ACTION] Fetch records → `e_topic_ai_agent`
16. **`bvAH5`** [CALL_WORKFLOW] Call automation → auto `67e250ffb174fc3bd7e99420`
17. **`_ETxAw`** [CALL_WORKFLOW] Call automation → auto `67ce5eefdd8cc819cebcc949`
18. **`n_JKxqh`** [ACTION] Execute Groovy code
19. **`_kcF0J`** [ACTION] Add items to list
20. **`2u6lK`** [ACTION] Create variables
21. **`0ONEL`** [ACTION] Get Session Variables
22. **`nOENa`** [IF_ELSE] Condition
23. **`n_8AEV3`** [IF_ELSE] Condition
24. **`4DBLf`** [ACTION] Update variables
25. **`n_Qy5Cj`** [IF_ELSE] Condition
26. **`n_EScwV`** [ACTION] Update variables
27. **`n_kWQLa`** [ACTION] Fetch record by ID → `ai_agent_llm_model`
28. **`eDsrj`** [CALL_WORKFLOW] Call automation → auto `682c17038bb4a0449efc9ec9`
29. **`n_1A1C5`** [IF_ELSE] Condition
30. **`n_ZRHmn`** [BRANCH] 
31. **`n_f5Qya`** [ACTION] Update variables
32. **`n_ZRHmn@1`** [BRANCH_CONDITION] 
33. **`n_ZRHmn@2`** [BRANCH_CONDITION] 
34. **`n_W0xac`** [ACTION] Execute Groovy code
35. **`n_AYIdS`** [IF_ELSE] Condition
36. **`n_RhBIP`** [CALL_WORKFLOW] Call automation → auto `6a227596c0911a1a0e133f35`
37. **`n_AO6ui`** [IF_ELSE] Condition
38. **`n_mdmFg`** [ACTION] Update variables
39. **`n_ToOVH`** [CALL_WORKFLOW] Call automation → auto `6970a524648686730e1c9793`
40. **`n_xj4co`** [ACTION] Update variables
41. **`n_Yh7Bm`** [ACTION] Execute Groovy code
42. **`n_sp6BC`** [ACTION] Update records by query → `e_ai_agent_conversation_state`
43. **`n_x3AOa`** [ACTION] Update variables
44. **`MmIks`** [STOP] Respond to automation

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `0WoDm` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `53LAF` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 3 | `n_WI3dW` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67a48d37f8f1744841dabb63` | False |
| 4 | `iNEXV` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 5 | `jgdBf` | CALL_WORKFLOW | Call interface | `callables_call_interface` | `` | `` | False |
| 6 | `n_RpDhm` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 7 | `CVd2b` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `e_ai_agent_conversation_state` | `` | False |
| 8 | `n_CWEZ5` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 9 | `n_Fj5Ft` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 10 | `n_bNpOV` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `e_session_task_state` | `` | False |
| 11 | `n_PUyIC` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 12 | `n_yhNyU` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 13 | `24f6D` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 14 | `O0e3K` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `e_topic_ai_agent` | `` | False |
| 15 | `_XnYkm` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 16 | `_ETxAw` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67ce5eefdd8cc819cebcc949` | False |
| 17 | `_kcF0J` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 18 | `bvAH5` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67e250ffb174fc3bd7e99420` | False |
| 19 | `n_JKxqh` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 20 | `2u6lK` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 21 | `0ONEL` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 22 | `nOENa` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 23 | `4DBLf` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 24 | `n_8AEV3` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 25 | `n_EScwV` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 26 | `n_Qy5Cj` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 27 | `eDsrj` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `682c17038bb4a0449efc9ec9` | False |
| 28 | `n_kWQLa` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `ai_agent_llm_model` | `` | False |
| 29 | `n_1A1C5` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 30 | `n_f5Qya` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 31 | `n_ZRHmn` | BRANCH |  | `` | `` | `` | False |
| 32 | `n_ZRHmn@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 33 | `n_AYIdS` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 34 | `n_ToOVH` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6970a524648686730e1c9793` | False |
| 35 | `n_x3AOa` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 36 | `n_mdmFg` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 37 | `n_ZRHmn@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 38 | `n_RhBIP` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6a227596c0911a1a0e133f35` | False |
| 39 | `n_xj4co` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 40 | `n_W0xac` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 41 | `n_AO6ui` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 42 | `n_sp6BC` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `e_ai_agent_conversation_state` | `` | False |
| 43 | `n_Yh7Bm` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 44 | `MmIks` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 682dc974e1b22528650c642f.json -->
## Belcorp | User Input Handling

| Campo | Valor |
|-------|-------|
| **ID** | `682dc974e1b22528650c642f` |
| **lcName** | belcorp | user input handling |
| **Deploy** | v47 / wf v73 |
| **Definition** | `69c445262a2585044ffb1483` |
| **Nodos / edges** | 65 / 83 |

### Objetos (`object_type`)
- `service_hub_attachment` — nodos: `rcLm7`
- `service_hub_case` — nodos: `miWNR`, `_tMMfc`, `_7lqH9`
- `service_hub_message` — nodos: `j6Pvq`, `_WJILm`

### Otras interfaces callable
- `vIwbz` → `683ab3ec61120a1ae74f824e` (callables_from_interface)

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`vIwbz`** [START] Trigger interface
2. **`GKYVU`** [ACTION] Create variables
3. **`j6Pvq`** [ACTION] Fetch records → `service_hub_message`
4. **`miWNR`** [ACTION] Fetch records → `service_hub_case`
5. **`n_HXkDh`** [IF_ELSE] Condition
6. **`_WJILm`** [ACTION] Fetch records → `service_hub_message`
7. **`_tMMfc`** [ACTION] Update records by query → `service_hub_case`
8. **`iYcXL`** [ACTION] Create list
9. **`XbK7h`** [ACTION] Remove all items from list
10. **`9iuTV`** [IF_ELSE] Condition
11. **`ttRj7`** [ACTION] Update variables
12. **`SAzDY`** [IF_ELSE] Condition
13. **`aNAQ8`** [IF_ELSE] Condition
14. **`dAlo1`** [ACTION] Update variables
15. **`rcLm7`** [ACTION] Fetch records → `service_hub_attachment`
16. **`guYJc`** [IF_ELSE] Condition
17. **`d5yVw`** [STOP] Respond to automation
18. **`tkiMn`** [IF_ELSE] Condition
19. **`rxHLa`** [BRANCH] 
20. **`3uRNG`** [BRANCH] 
21. **`n_8dF3T`** [IF_ELSE] Condition
22. **`qFoXw`** [ACTION] Update variables
23. **`rxHLa@1`** [BRANCH_CONDITION] 
24. **`rxHLa@2`** [BRANCH_CONDITION] 
25. **`rxHLa@3`** [BRANCH_CONDITION] 
26. **`rxHLa@4`** [BRANCH_CONDITION] 
27. **`_pOuOg`** [ACTION] Execute Groovy code
28. **`3uRNG@1`** [BRANCH_CONDITION] 
29. **`3uRNG@2`** [BRANCH_CONDITION] 
30. **`3uRNG@3`** [BRANCH_CONDITION] 
31. **`3uRNG@4`** [BRANCH_CONDITION] 
32. **`n_xJxyD`** [ACTION] Execute Groovy code
33. **`wkB6t`** [ACTION] Update variables
34. **`n_mhMTM`** [ACTION] Update variables
35. **`NxvmW`** [STOP] Respond to automation
36. **`lSgcp`** [STOP] Respond to automation
37. **`RKuLW`** [ACTION] Add item to list
38. **`_yKCEe`** [STOP] Respond to automation
39. **`Z9dMZ`** [ACTION] Add item to list
40. **`p7RY4`** [ACTION] Add item to list
41. **`tG2Ck`** [ACTION] Add item to list
42. **`_LUkrR`** [STOP] Respond to automation
43. **`jrQFB`** [ACTION] Add item to list
44. **`KTOCn`** [ACTION] Add item to list
45. **`nKw3e`** [ACTION] Add item to list
46. **`rDJPX`** [ACTION] Add item to list
47. **`3tMnh`** [ACTION] Add item to list
48. **`2ubvp`** [ACTION] Add item to list
49. **`L9atD`** [ACTION] Add item to list
50. **`R42Ve`** [ACTION] Add item to list
51. **`RHEpe`** [ACTION] Execute Groovy code
52. **`pOo2O`** [STOP] Respond to automation
53. **`oErcI`** [STOP] Respond to automation
54. **`ErjTQ`** [ACTION] Execute Groovy code
55. **`kXh7l`** [IF_ELSE] Condition
56. **`fwrJ7`** [IF_ELSE] Condition
57. **`1nnq5`** [ACTION] Execute Groovy code
58. **`_7lqH9`** [ACTION] Update records by query → `service_hub_case`
59. **`VHCeF`** [ACTION] Execute Groovy code
60. **`UPAku`** [STOP] Respond to automation
61. **`8izE3`** [IF_ELSE] Condition
62. **`bQuO1`** [STOP] Respond to automation
63. **`Pb7XA`** [IF_ELSE] Condition
64. **`u12Bu`** [STOP] Respond to automation
65. **`1aBpQ`** [STOP] Respond to automation

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `vIwbz` | START | Trigger interface | `callables_from_interface` | `` | `` | False |
| 2 | `GKYVU` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 3 | `j6Pvq` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message` | `` | False |
| 4 | `miWNR` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 5 | `n_HXkDh` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 6 | `_tMMfc` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 7 | `_WJILm` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message` | `` | False |
| 8 | `iYcXL` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 9 | `XbK7h` | ACTION | Remove all items from list | `variable_by_unifyapps_clear_list` | `` | `` | False |
| 10 | `9iuTV` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 11 | `SAzDY` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 12 | `rcLm7` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_attachment` | `` | False |
| 13 | `tkiMn` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 14 | `qFoXw` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 15 | `n_8dF3T` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 16 | `n_mhMTM` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 17 | `wkB6t` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 18 | `dAlo1` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 19 | `ttRj7` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 20 | `aNAQ8` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 21 | `guYJc` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 22 | `3uRNG` | BRANCH |  | `` | `` | `` | False |
| 23 | `3uRNG@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 24 | `Z9dMZ` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 25 | `KTOCn` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 26 | `2ubvp` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 27 | `pOo2O` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 28 | `3uRNG@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 29 | `p7RY4` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 30 | `nKw3e` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 31 | `L9atD` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 32 | `oErcI` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 33 | `3uRNG@3` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 34 | `tG2Ck` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 35 | `rDJPX` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 36 | `R42Ve` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 37 | `ErjTQ` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 38 | `fwrJ7` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 39 | `UPAku` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 40 | `VHCeF` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 41 | `Pb7XA` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 42 | `1aBpQ` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 43 | `3uRNG@4` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 44 | `_LUkrR` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 45 | `n_xJxyD` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 46 | `rxHLa` | BRANCH |  | `` | `` | `` | False |
| 47 | `rxHLa@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 48 | `NxvmW` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 49 | `rxHLa@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 50 | `lSgcp` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 51 | `rxHLa@3` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 52 | `RKuLW` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 53 | `jrQFB` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 54 | `3tMnh` | ACTION | Add item to list | `variable_by_unifyapps_add_item_to_list` | `` | `` | False |
| 55 | `RHEpe` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 56 | `kXh7l` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 57 | `_7lqH9` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 58 | `bQuO1` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 59 | `1nnq5` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 60 | `8izE3` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 61 | `u12Bu` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 62 | `rxHLa@4` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 63 | `_yKCEe` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 64 | `_pOuOg` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 65 | `d5yVw` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 6851442f9e30586f552a6d73.json -->
## Call LLM (AI Agent) Wrapper

| Campo | Valor |
|-------|-------|
| **ID** | `6851442f9e30586f552a6d73` |
| **lcName** | call llm (ai agent) wrapper |
| **Deploy** | v18 / wf v104 |
| **Definition** | `6a5233e89a308f0d8f0b472e` |
| **Nodos / edges** | 62 / 70 |

### Objetos (`object_type`)
- `e_ai_agent_conversation_state` — nodos: `cOsMz`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `_kT4xq` | `685134fb2b94c20f13b8c7e2` | True |
| `n_2XRoS` | `6851324e2b94c20f13b8b57e` | True |
| `n_38W5H` | `68b827559a4a9d0149caa07d` | True |
| `n_BfDWb` | `685133b62b94c20f13b8bfaf` | True |
| `n_XK5wu` | `67e2d58d94875751e6bc1066` | True |
| `n_uKsKv` | `66ac70650f725f5b425d12d8` | True |

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`n_EYCFG`** [START] Trigger via automation
2. **`cOsMz`** [ACTION] Fetch record by ID → `e_ai_agent_conversation_state`
3. **`n_bVwbO`** [ACTION] Get Session Variables
4. **`n_XK5wu`** [CALL_WORKFLOW] Call automation → auto `67e2d58d94875751e6bc1066`
5. **`n_JkEWq`** [ACTION] Create variables
6. **`n_VNvLY`** [IF_ELSE] Condition
7. **`n_g102b`** [ACTION] Create variables
8. **`n_j2QSf`** [ACTION] Execute Groovy code
9. **`n_5jpdT`** [ACTION] Create list
10. **`n_jWbk6`** [ACTION] Update variables
11. **`n_wWSDL`** [IF_ELSE] Condition
12. **`n_bT4C3`** [ACTION] Compile template
13. **`n_1gqN9`** [ACTION] Compile template
14. **`n_44BOI`** [ACTION] Create variables
15. **`_JZg6g`** [ACTION] Compile template
16. **`n_CBsnS`** [IF_ELSE] Condition
17. **`nr1i4`** [BRANCH] 
18. **`_28KVU`** [ACTION] Execute Groovy code
19. **`nr1i4@1`** [BRANCH_CONDITION] 
20. **`nr1i4@10`** [BRANCH_CONDITION] 
21. **`nr1i4@12`** [BRANCH_CONDITION] 
22. **`nr1i4@13`** [BRANCH_CONDITION] 
23. **`_CGuc4`** [ACTION] Execute Groovy code
24. **`n_eywTR`** [ACTION] Update variables
25. **`_EutTw`** [ACTION] Execute Groovy code
26. **`_Q76JK`** [ACTION] Update variables
27. **`_xHdrE`** [ACTION] Compile template
28. **`_O13oJ`** [ACTION] Compile template
29. **`24OpA`** [ACTION] Compile template
30. **`DYSBx`** [ACTION] Compile template
31. **`_RcoHI`** [ACTION] Execute Groovy code
32. **`_T4hbf`** [ACTION] Update variables
33. **`_EXLi1`** [ACTION] Update variables
34. **`5TfUo`** [ACTION] Update variables
35. **`JUYZS`** [ACTION] Update variables
36. **`_02bSh`** [ACTION] Add items to list
37. **`n_CJt0t`** [ACTION] Execute Groovy code
38. **`_rHbI1`** [ACTION] Add items to list
39. **`n_SVd0w`** [ACTION] Execute Groovy code
40. **`_wDRHI`** [ACTION] Execute Groovy code
41. **`n_19iUr`** [ACTION] Update variables
42. **`_HfWr9`** [ACTION] Add items to list
43. **`n_SWu2T`** [ACTION] Add items to list
44. **`_qad3e`** [ACTION] Add items to list
45. **`n_0MbHC`** [ACTION] Execute Groovy code
46. **`n_hBQei`** [IF_ELSE] Condition
47. **`n_uKsKv`** [CALL_WORKFLOW] Call automation → auto `66ac70650f725f5b425d12d8`
48. **`n_spPEt`** [ACTION] Update variables
49. **`_7oLuV`** [BRANCH] 
50. **`n_38W5H`** [CALL_WORKFLOW] Call automation → auto `68b827559a4a9d0149caa07d`
51. **`_7oLuV@1`** [BRANCH_CONDITION] 
52. **`_7oLuV@2`** [BRANCH_CONDITION] 
53. **`_7oLuV@4`** [BRANCH_CONDITION] 
54. **`_7oLuV@5`** [BRANCH_CONDITION] 
55. **`_kT4xq`** [CALL_WORKFLOW] Call automation → auto `685134fb2b94c20f13b8c7e2`
56. **`n_BfDWb`** [CALL_WORKFLOW] Call automation → auto `685133b62b94c20f13b8bfaf`
57. **`n_mhgm4`** [STOP] Respond to automation
58. **`n_2XRoS`** [CALL_WORKFLOW] Call automation → auto `6851324e2b94c20f13b8b57e`
59. **`_0jov0`** [STOP] Respond to automation
60. **`_1PctH`** [STOP] Respond to automation
61. **`_gdmvP`** [STOP] Respond to automation
62. **`_2HOcr`** [STOP] Respond to automation

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `n_EYCFG` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `cOsMz` | ACTION | Fetch record by ID | `storage_by_unifyapps_get_record_by_id` | `e_ai_agent_conversation_state` | `` | False |
| 3 | `n_bVwbO` | ACTION | Get Session Variables | `variable_by_unifyapps_get_session_variab` | `` | `` | False |
| 4 | `n_XK5wu` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67e2d58d94875751e6bc1066` | False |
| 5 | `n_JkEWq` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 6 | `n_VNvLY` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 7 | `n_j2QSf` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 8 | `n_jWbk6` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 9 | `n_g102b` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 10 | `n_5jpdT` | ACTION | Create list | `variable_by_unifyapps_create_list` | `` | `` | False |
| 11 | `n_wWSDL` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 12 | `n_1gqN9` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 13 | `_JZg6g` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 14 | `n_bT4C3` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 15 | `n_44BOI` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 16 | `n_CBsnS` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 17 | `_28KVU` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 18 | `n_eywTR` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 19 | `nr1i4` | BRANCH |  | `` | `` | `` | False |
| 20 | `nr1i4@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 21 | `_EutTw` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 22 | `DYSBx` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 23 | `JUYZS` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 24 | `_wDRHI` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 25 | `_qad3e` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 26 | `nr1i4@10` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 27 | `_Q76JK` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 28 | `_RcoHI` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 29 | `_02bSh` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 30 | `nr1i4@12` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 31 | `_xHdrE` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 32 | `_T4hbf` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 33 | `n_CJt0t` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 34 | `_HfWr9` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 35 | `nr1i4@13` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 36 | `_O13oJ` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 37 | `_EXLi1` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 38 | `_rHbI1` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 39 | `_CGuc4` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 40 | `24OpA` | ACTION | Compile template | `template_by_unifyapps_compile_template` | `` | `` | False |
| 41 | `5TfUo` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 42 | `n_SVd0w` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 43 | `n_SWu2T` | ACTION | Add items to list | `variable_by_unifyapps_add_items_to_list` | `` | `` | False |
| 44 | `n_19iUr` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 45 | `n_0MbHC` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 46 | `n_hBQei` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 47 | `n_spPEt` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 48 | `n_uKsKv` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `66ac70650f725f5b425d12d8` | False |
| 49 | `n_38W5H` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `68b827559a4a9d0149caa07d` | False |
| 50 | `_7oLuV` | BRANCH |  | `` | `` | `` | False |
| 51 | `_7oLuV@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 52 | `n_BfDWb` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `685133b62b94c20f13b8bfaf` | False |
| 53 | `_gdmvP` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 54 | `_7oLuV@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 55 | `n_mhgm4` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 56 | `_7oLuV@4` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 57 | `n_2XRoS` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6851324e2b94c20f13b8b57e` | False |
| 58 | `_2HOcr` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 59 | `_7oLuV@5` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 60 | `_0jov0` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 61 | `_kT4xq` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `685134fb2b94c20f13b8c7e2` | False |
| 62 | `_1PctH` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 693e98e086c48457515a14d9.json -->
## LoginSDK New test

| Campo | Valor |
|-------|-------|
| **ID** | `693e98e086c48457515a14d9` |
| **lcName** | loginsdk new test |
| **Deploy** | v94 / wf v143 |
| **Definition** | `6ab6d0082c68ad64f243e7eb` |
| **Nodos / edges** | 216 / 266 |

### Objetos (`object_type`)
- `belcorp_customer_number` — nodos: `_PCN2o`, `_z04oO`, `R0094`, `Ujb2M`
- `belcorp_master_data` — nodos: `_XZyBI`, `23t8R`, `n_IBSj2`, `_uBAG4`, `_cEiBH`, `_yVQlv`, `_wZeBk`, `_kF0h1`, … (+40)
- `belcorp_skill_type` — nodos: `_3c1hN`
- `service_hub_case` — nodos: `_Kqxfk`, `_BpWcJ`, `_tP0A2`, `n_TirBx`, `_ZNRmc`, `p9CYQ`, `oQ6VI`, `3RjK3`, … (+1)
- `service_hub_message` — nodos: `n_Y6Gmt`
- `snowflake_case_level_2` — nodos: `62d3b`

### Llamadas a otras automatizaciones (`callables_call_automation`)

| Node | automationId | sync |
|------|--------------|------|
| `8fEpP` | `677b8ead53fb3d1eefd95ba0` | True |
| `MglRN` | `6752b5d674e2bf1fcf3d9dab` | True |
| `YnMgD` | `67b2cf05598c960762f64713` | True |
| `ZmOdg` | `67b2cf05598c960762f64713` | True |
| `_0Hmzp` | `67487a0fda695160fbebe499` | True |
| `_29PEZ` | `685e54fe32228032eecf1eec` | True |
| `_B50EN` | `67487a0fda695160fbebe499` | True |
| `_In1xI` | `685e54fe32228032eecf1eec` | True |
| `_O2HJe` | `685e54fe32228032eecf1eec` | True |
| `_O8vFv` | `685e54fe32228032eecf1eec` | True |
| `_WYgHR` | `685e54fe32228032eecf1eec` | True |
| `_Z2G9l` | `685e54fe32228032eecf1eec` | True |
| `_Z9pa0` | `676db02f0c93231c945eb607` | True |
| `_hR8um` | `685e54fe32228032eecf1eec` | True |
| `_lumBL` | `685e54fe32228032eecf1eec` | True |
| `_uBAaU` | `676dae390c93231c945e8d7d` | True |
| `elmgr` | `6752b5d674e2bf1fcf3d9dab` | True |
| `n_AmV1w` | `685e54fe32228032eecf1eec` | True |
| `n_YWFGk` | `69c17be209f85d3b486955fa` | True |
| `n_lF2gs` | `69c17be209f85d3b486955fa` | True |
| `xEYok` | `676aa6320c93231c941f0115` | True |
| `zsO6z` | `67582028bfcac2349314ecfa` | True |

### Llamadas HTTP (`custom_http_endpoint*`)

| Node | Título | Detalle |
|------|--------|---------|
| `_7GJWH` | Execute REST multipart request | httpMethod=POST; path=/api/login; baseUrl={{ __ENV__.outputs.Base_Url_Prod_SB }}; headersList=…; queryParamsList=…; body=… |
| `6EFsO` | Execute REST multipart request | httpMethod=POST; path=/api/login; baseUrl={{ __ENV__.outputs.Base_Url_Prod_SB }}; headersList=…; queryParamsList=…; body=… |
| `Od4lU` | Execute REST multipart request | httpMethod=POST; path=/api/login; baseUrl={{ __ENV__.outputs.Base_Url_Prod_SB }}; headersList=…; queryParamsList=…; body=… |
| `_JndhC` | Execute REST multipart request | httpMethod=GET; path=/api/account/RefreshData; baseUrl={{ __ENV__.outputs.Base_Url_Prod_SB }}; headersList=…; queryParamsList=… |
| `fl1IL` | Execute REST multipart request | httpMethod=GET; path=/api/verify_phone/; baseUrl={{ __ENV__.outputs.Base_Url_Prod_SB }}; headersList=…; body=… |
| `_y1hVA` | Execute REST multipart request | httpMethod=POST; path=/api/login; baseUrl={{ __ENV__.outputs.Base_Url_Prod_SB }}; headersList=…; queryParamsList=…; body=… |
| `dPeYi` | Execute REST multipart request | httpMethod=GET; path=/api/account/RefreshData; baseUrl={{ __ENV__.outputs.Base_Url_Prod_SB }}; headersList=…; queryParamsList=… |
| `_sCK6Y` | Execute REST request | httpMethod=GET; path=/postulants/whatsapp/v1/{{ _z04oO.outputs.properties.countryCode }}/phone/verify/{{ _z04oO.outputs.properties.phoneNumber }}; baseUrl={{ __ENV__.outputs.Base_URL_QA }}; headersList=…; queryParamsList=… |
| `tUeES` | Execute REST request | httpMethod=POST; path=/api/login; baseUrl={{ __ENV__.outputs.Base_Url_Prod_SB }}; headersList=…; body=… |
| `_cfOAz` | Execute REST multipart request | httpMethod=GET; path=/api/account/RefreshData; baseUrl={{ __ENV__.outputs.Base_Url_Prod_SB }}; headersList=…; queryParamsList=… |

### Publicación al usuario (`conv_ai_by_unifyapps_publish_response`)

- **`Dg1ap`** Publish Response: interface=__ua__publish_response_interface; fallback=; caseId={{ fFjyT.outputs.caseId }}
- **`nbW7w`** Publish Response: interface=__ua__publish_response_interface; fallback=; caseId={{ fFjyT.outputs.caseId }}
- **`qz0mJ`** Publish Response: interface=__ua__publish_response_interface; fallback=; caseId={{ fFjyT.outputs.caseId }}
- **`_EEHDY`** Publish Response: interface=__ua__publish_response_interface; fallback=; caseId={{ fFjyT.outputs.caseId }}
- **`_KpAoq`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _cBtVU.outputs.caseId }}
- **`IJWTn`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _cBtVU.outputs.caseId }}
- **`W5uiy`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _cBtVU.outputs.caseId }}
- **`2rHSU`** Publish Response: interface=__ua__publish_response_interface; fallback=; caseId={{ _cBtVU.outputs.caseId }}
- **`0ZTms`** Publish Response: interface=__ua__publish_response_interface; fallback=66fbed229edc4e0b6303cefd; caseId={{ _cBtVU.outputs.caseId }}

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`_cBtVU`** [START] Trigger via automation
2. **`_Kqxfk`** [ACTION] Fetch records → `service_hub_case`
3. **`n_Y6Gmt`** [ACTION] Fetch records → `service_hub_message`
4. **`_XZyBI`** [ACTION] Fetch records → `belcorp_master_data`
5. **`n_bK1u9`** [ACTION] Create variables
6. **`_utSeed`** [ACTION] Update variables
7. **`n_31CwM`** [IF_ELSE] Condition
8. **`23t8R`** [ACTION] Fetch records → `belcorp_master_data`
9. **`_kZW6O`** [IF_ELSE] Condition
10. **`_BpWcJ`** [ACTION] Fetch records → `service_hub_case`
11. **`_2jiMf`** [IF_ELSE] Condition
12. **`_B50EN`** [CALL_WORKFLOW] Call automation → auto `67487a0fda695160fbebe499`
13. **`_0Hmzp`** [CALL_WORKFLOW] Call automation → auto `67487a0fda695160fbebe499`
14. **`JfFZV`** [IF_ELSE] Condition
15. **`QrnUh`** [IF_ELSE] Condition
16. **`_z04oO`** [ACTION] Fetch records → `belcorp_customer_number`
17. **`_PCN2o`** [ACTION] Fetch records → `belcorp_customer_number`
18. **`DLAWr`** [STOP] Respond to automation
19. **`YnMgD`** [CALL_WORKFLOW] Call automation → auto `67b2cf05598c960762f64713`
20. **`_xJUe0`** [ACTION] Fetch User
21. **`n_ETXw9`** [ACTION] Update records by query → `belcorp_master_data`
22. **`n_hrTZx`** [ACTION] Update variables
23. **`n_OToru`** [ACTION] Create variables
24. **`_c0JBK`** [STOP] Respond to automation
25. **`n_aaW5r`** [ACTION] Create variables
26. **`_gDBps`** [STOP] Respond to automation
27. **`6UQCI`** [ACTION] Fetch User
28. **`n_75anx`** [IF_ELSE] Condition
29. **`3E0oj`** [IF_ELSE] Condition
30. **`jaEgi`** [ACTION] Create variables
31. **`_rRgpb`** [ACTION] Update variables
32. **`n_GibkZ`** [ACTION] Update variables
33. **`UBXpm`** [ACTION] Create variables
34. **`IKi88`** [ACTION] Fetch records → `belcorp_master_data`
35. **`fl1IL`** [ACTION] Execute REST multipart request → HTTP
36. **`_kKCof`** [ACTION] Fetch User
37. **`n_AlPwl`** [IF_ELSE] Condition
38. **`CP8SO`** [IF_ELSE] Condition
39. **`pF4x7`** [BRANCH] 
40. **`OmLxI`** [ACTION] Fetch records → `belcorp_master_data`
41. **`_jIspe`** [ACTION] Create variables
42. **`tUeES`** [ACTION] Execute REST request → HTTP
43. **`n_3Y9Yd`** [ACTION] Update variables
44. **`X0S5Q`** [ACTION] Create record → `belcorp_master_data`
45. **`0icYw`** [ACTION] Update an existing record → `belcorp_master_data`
46. **`pF4x7@1`** [BRANCH_CONDITION]  *(skip)*
47. **`pF4x7@2`** [BRANCH_CONDITION] 
48. **`_sCK6Y`** [ACTION] Execute REST request → HTTP
49. **`sHUJL`** [IF_ELSE] Condition
50. **`n_nhPtB`** [IF_ELSE] Condition
51. **`p9CYQ`** [ACTION] Update records by query → `service_hub_case`
52. **`cVrQL`** [ACTION] Fetch records → `belcorp_master_data`
53. **`xEYok`** [CALL_WORKFLOW] Call automation → auto `676aa6320c93231c941f0115`
54. **`8SyOx`** [ACTION] Fetch records → `belcorp_master_data`
55. **`n_iaCeM`** [IF_ELSE] Condition
56. **`_ZHZI7`** [IF_ELSE] Condition
57. **`_uHnky`** [IF_ELSE] Condition
58. **`ynp5W`** [ACTION] Create record → `belcorp_master_data`
59. **`jYCUi`** [ACTION] Update an existing record → `belcorp_master_data`
60. **`NeZyF`** [ACTION] Create variables
61. **`iVzvo`** [ACTION] Execute Groovy code
62. **`Ztdva`** [DELAY] Set delay duration *(skip)*
63. **`yj0Tt`** [IF_ELSE] Condition
64. **`BE3kB`** [IF_ELSE] Condition
65. **`n_mHj7C`** [ACTION] Update variables
66. **`n_ZkLJe`** [ACTION] Update variables
67. **`_3FE12`** [ACTION] Update variables
68. **`_2CTZS`** [ACTION] Update variables
69. **`_YMUCe`** [ACTION] Update variables
70. **`_dhh64`** [ACTION] Update variables
71. **`W5uiy`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
72. **`n_IBSj2`** [ACTION] Fetch records → `belcorp_master_data`
73. **`nBxO2`** [IF_ELSE] Condition
74. **`_cfOAz`** [ACTION] Execute REST multipart request → HTTP
75. **`Fp0ie`** [ACTION] Create record → `belcorp_master_data`
76. **`qQzTV`** [ACTION] Update an existing record → `belcorp_master_data`
77. **`NZLz8`** [ACTION] Create record → `belcorp_master_data`
78. **`TnI8F`** [ACTION] Update an existing record → `belcorp_master_data`
79. **`_y1hVA`** [ACTION] Execute REST multipart request → HTTP
80. **`_gd0x1`** [ACTION] Update records by query → `belcorp_master_data`
81. **`n_Kiyd3`** [ACTION] Fetch records → `belcorp_master_data`
82. **`_Tcn9C`** [BRANCH] 
83. **`n_AmV1w`** [CALL_WORKFLOW] Call automation → auto `685e54fe32228032eecf1eec`
84. **`n_ZvPGu`** [IF_ELSE] Condition
85. **`l7ZcO`** [STOP] Respond to automation
86. **`_utCountryCfo`** [ACTION] Update variables
87. **`oQ6VI`** [ACTION] Update records by query → `service_hub_case`
88. **`3RjK3`** [ACTION] Update records by query → `service_hub_case`
89. **`_xLY5V`** [ACTION] Create record → `belcorp_master_data`
90. **`_v5dij`** [ACTION] Update variables
91. **`_NN22S`** [ACTION] Update variables *(skip)*
92. **`AHr1F`** [ACTION] Fetch records → `belcorp_master_data`
93. **`xDKCA`** [ACTION] Fetch records → `belcorp_master_data`
94. **`n_Q0ZFf`** [IF_ELSE] Condition
95. **`_XKj0A`** [STOP] Respond to automation
96. **`_Tcn9C@1`** [BRANCH_CONDITION] 
97. **`_Tcn9C@2`** [BRANCH_CONDITION] 
98. **`_Tcn9C@3`** [BRANCH_CONDITION] 
99. **`_Tcn9C@4`** [BRANCH_CONDITION] 
100. **`_Tcn9C@5`** [BRANCH_CONDITION] 
101. **`OBpBP`** [STOP] Respond to automation
102. **`_7GJWH`** [ACTION] Execute REST multipart request → HTTP
103. **`n_lF2gs`** [CALL_WORKFLOW] Call automation → auto `69c17be209f85d3b486955fa` *(skip)*
104. **`lE2yz`** [ACTION] Execute Groovy code
105. **`flUgx`** [ACTION] Fetch records → `belcorp_master_data`
106. **`LpiIo`** [ACTION] Update variables
107. **`_rbPgn`** [ACTION] Update records by query → `belcorp_master_data`
108. **`_9TQjH`** [ACTION] Update records by query → `belcorp_master_data`
109. **`nUoJ8`** [IF_ELSE] Condition
110. **`vD20M`** [IF_ELSE] Condition
111. **`n_mViDv`** [ACTION] Create record → `belcorp_master_data`
112. **`n_RJUGF`** [ACTION] Update an existing record → `belcorp_master_data`
113. **`_2UUu1`** [ACTION] Update variables
114. **`_sh33o`** [ACTION] Update variables
115. **`_6OYVv`** [ACTION] Update variables
116. **`_vPnJW`** [ACTION] Update variables
117. **`_gyQwd`** [ACTION] Update variables
118. **`n_TirBx`** [ACTION] Update an existing record's fields → `service_hub_case`
119. **`JsD8y`** [ACTION] Update variables
120. **`b2s3u`** [BRANCH] 
121. **`n_UQGLL`** [STOP] Respond to automation
122. **`tpm8u`** [ACTION] Update variables
123. **`SpxJg`** [IF_ELSE] Condition
124. **`0ZTms`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response *(skip)*
125. **`_tP0A2`** [ACTION] Update an existing record's fields → `service_hub_case` *(skip)*
126. **`_Yxmvq`** [ACTION] Create variables
127. **`3LgNz`** [ACTION] Create record → `belcorp_master_data`
128. **`Epdyq`** [ACTION] Update an existing record → `belcorp_master_data`
129. **`Fr1fF`** [ACTION] Create record → `belcorp_master_data`
130. **`pb3Qd`** [ACTION] Update an existing record → `belcorp_master_data`
131. **`_pVLuX`** [ACTION] Update records by query → `belcorp_master_data`
132. **`_JndhC`** [ACTION] Execute REST multipart request → HTTP
133. **`b2s3u@1`** [BRANCH_CONDITION] 
134. **`b2s3u@2`** [BRANCH_CONDITION] 
135. **`b2s3u@3`** [BRANCH_CONDITION] 
136. **`qz0mJ`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
137. **`7AOx6`** [ACTION] Execute Groovy code
138. **`MUXEV`** [ACTION] Create record → `belcorp_master_data`
139. **`IkDmA`** [ACTION] Update an existing record → `belcorp_master_data`
140. **`_hR8um`** [CALL_WORKFLOW] Call automation → auto `685e54fe32228032eecf1eec` *(skip)*
141. **`dPeYi`** [ACTION] Execute REST multipart request → HTTP
142. **`_KpAoq`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
143. **`_ZNRmc`** [ACTION] Fetch records → `service_hub_case`
144. **`_utCountryJnd`** [ACTION] Update variables
145. **`_EEHDY`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
146. **`6EFsO`** [ACTION] Execute REST multipart request → HTTP
147. **`Od4lU`** [ACTION] Execute REST multipart request → HTTP
148. **`ZmOdg`** [CALL_WORKFLOW] Call automation → auto `67b2cf05598c960762f64713`
149. **`_O2HJe`** [CALL_WORKFLOW] Call automation → auto `685e54fe32228032eecf1eec`
150. **`Ujb2M`** [ACTION] Update an existing record → `belcorp_customer_number`
151. **`qr8UT`** [ACTION] Update variables
152. **`9cDOS`** [STOP] Respond to automation
153. **`_utCountryDpy`** [ACTION] Update variables
154. **`hGMfa`** [ACTION] Fetch records → `belcorp_master_data`
155. **`_Z2G9l`** [CALL_WORKFLOW] Call automation → auto `685e54fe32228032eecf1eec`
156. **`n_uuAwE`** [IF_ELSE] Condition
157. **`_uBAG4`** [ACTION] Fetch records → `belcorp_master_data`
158. **`_In1xI`** [CALL_WORKFLOW] Call automation → auto `685e54fe32228032eecf1eec`
159. **`LYk1x`** [ACTION] Update variables
160. **`Dg1ap`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
161. **`KWyzQ`** [ACTION] Update variables
162. **`nbW7w`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
163. **`CwoGd`** [STOP] Respond to automation
164. **`3BsqV`** [ACTION] Fetch records → `belcorp_master_data`
165. **`2rHSU`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
166. **`oBPBn`** [ACTION] Fetch records → `service_hub_case`
167. **`TLCyQ`** [ACTION] Execute Groovy code *(skip)*
168. **`_utFromHgm`** [ACTION] Update variables
169. **`_emSs0`** [STOP] Respond to automation
170. **`_BdrUE`** [STOP] Respond to automation
171. **`n_YWFGk`** [CALL_WORKFLOW] Call automation → auto `69c17be209f85d3b486955fa` *(skip)*
172. **`_QkLyQ`** [IF_ELSE] Condition
173. **`_pTSLD`** [STOP] Respond to automation
174. **`_O8vFv`** [CALL_WORKFLOW] Call automation → auto `685e54fe32228032eecf1eec`
175. **`_29PEZ`** [CALL_WORKFLOW] Call automation → auto `685e54fe32228032eecf1eec`
176. **`9lZAQ`** [IF_ELSE] Condition
177. **`_lumBL`** [CALL_WORKFLOW] Call automation → auto `685e54fe32228032eecf1eec` *(skip)*
178. **`62d3b`** [ACTION] Update records by query → `snowflake_case_level_2`
179. **`_Z9pa0`** [CALL_WORKFLOW] Call automation → auto `676db02f0c93231c945eb607` *(skip)*
180. **`0cowl`** [IF_ELSE] Condition
181. **`_wZeBk`** [ACTION] Create record → `belcorp_master_data`
182. **`_cEiBH`** [ACTION] Update an existing record → `belcorp_master_data`
183. **`IiAig`** [STOP] Respond to automation
184. **`0DhzP`** [STOP] Respond to automation
185. **`6MLGx`** [ACTION] Create record → `belcorp_master_data`
186. **`E7iMm`** [ACTION] Update an existing record → `belcorp_master_data`
187. **`bgCuI`** [STOP] Respond to automation
188. **`7sekS`** [BRANCH] 
189. **`_3c1hN`** [ACTION] Fetch records → `belcorp_skill_type` *(skip)*
190. **`JXydH`** [ACTION] Create record → `belcorp_master_data`
191. **`9riaN`** [ACTION] Update an existing record → `belcorp_master_data`
192. **`_kF0h1`** [ACTION] Update records by query → `belcorp_master_data`
193. **`_yVQlv`** [ACTION] Update records by query → `belcorp_master_data`
194. **`7sekS@1`** [BRANCH_CONDITION] 
195. **`7sekS@2`** [BRANCH_CONDITION] 
196. **`MglRN`** [CALL_WORKFLOW] Call automation → auto `6752b5d674e2bf1fcf3d9dab`
197. **`_Ox2JE`** [IF_ELSE] Condition *(skip)*
198. **`IJWTn`** [CALL_INTERFACE_WORKFLOW] Publish Response → publish_response
199. **`_utConsultK`** [ACTION] Update variables
200. **`_utConsultY`** [ACTION] Update variables

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `_cBtVU` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `_Kqxfk` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 3 | `n_Y6Gmt` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_message` | `` | False |
| 4 | `_XZyBI` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 5 | `n_bK1u9` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 6 | `_utSeed` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 7 | `n_31CwM` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 8 | `23t8R` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 9 | `_BpWcJ` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 10 | `_0Hmzp` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67487a0fda695160fbebe499` | False |
| 11 | `_PCN2o` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_customer_number` | `` | False |
| 12 | `n_OToru` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 13 | `n_75anx` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 14 | `n_GibkZ` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 15 | `_rRgpb` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 16 | `_kKCof` | ACTION | Fetch User | `standard_entities_fetch_user` | `` | `` | False |
| 17 | `_jIspe` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 18 | `n_nhPtB` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 19 | `iVzvo` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 20 | `nBxO2` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 21 | `l7ZcO` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 22 | `NeZyF` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 23 | `n_IBSj2` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 24 | `n_ZvPGu` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 25 | `n_lF2gs` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `69c17be209f85d3b486955fa` | True |
| 26 | `n_UQGLL` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 27 | `_7GJWH` | ACTION | Execute REST multipart request | `custom_http_endpoint_execute_multipart` | `` | `` | False |
| 28 | `JsD8y` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 29 | `b2s3u` | BRANCH |  | `` | `` | `` | False |
| 30 | `b2s3u@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 31 | `6EFsO` | ACTION | Execute REST multipart request | `custom_http_endpoint_execute_multipart` | `` | `` | False |
| 32 | `LYk1x` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 33 | `Dg1ap` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 34 | `_O8vFv` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `685e54fe32228032eecf1eec` | False |
| 35 | `IiAig` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 36 | `b2s3u@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 37 | `Od4lU` | ACTION | Execute REST multipart request | `custom_http_endpoint_execute_multipart` | `` | `` | False |
| 38 | `KWyzQ` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 39 | `nbW7w` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 40 | `_29PEZ` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `685e54fe32228032eecf1eec` | False |
| 41 | `0DhzP` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 42 | `b2s3u@3` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 43 | `ZmOdg` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67b2cf05598c960762f64713` | False |
| 44 | `qz0mJ` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 45 | `_O2HJe` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `685e54fe32228032eecf1eec` | False |
| 46 | `CwoGd` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 47 | `_JndhC` | ACTION | Execute REST multipart request | `custom_http_endpoint_execute_multipart` | `` | `` | False |
| 48 | `_EEHDY` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 49 | `_In1xI` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `685e54fe32228032eecf1eec` | False |
| 50 | `_pTSLD` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 51 | `_utCountryJnd` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 52 | `_uBAG4` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 53 | `_QkLyQ` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 54 | `_cEiBH` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 55 | `_yVQlv` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `belcorp_master_data` | `` | False |
| 56 | `_utConsultY` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 57 | `_wZeBk` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 58 | `_kF0h1` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `belcorp_master_data` | `` | False |
| 59 | `_utConsultK` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 60 | `n_7HQus` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 61 | `_kZW6O` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 62 | `_B50EN` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67487a0fda695160fbebe499` | False |
| 63 | `_z04oO` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_customer_number` | `` | False |
| 64 | `n_hrTZx` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 65 | `6UQCI` | ACTION | Fetch User | `standard_entities_fetch_user` | `` | `` | False |
| 66 | `jaEgi` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 67 | `fl1IL` | ACTION | Execute REST multipart request | `custom_http_endpoint_execute_multipart` | `` | `` | False |
| 68 | `pF4x7` | BRANCH |  | `` | `` | `` | False |
| 69 | `pF4x7@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | True |
| 70 | `8SyOx` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 71 | `BE3kB` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 72 | `TnI8F` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 73 | `NZLz8` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 74 | `_v5dij` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 75 | `_rbPgn` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `belcorp_master_data` | `` | False |
| 76 | `_tP0A2` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | True |
| 77 | `pF4x7@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 78 | `n_iaCeM` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 79 | `n_ZkLJe` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 80 | `n_mHj7C` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 81 | `_y1hVA` | ACTION | Execute REST multipart request | `custom_http_endpoint_execute_multipart` | `` | `` | False |
| 82 | `AHr1F` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 83 | `nUoJ8` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 84 | `Epdyq` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 85 | `3LgNz` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 86 | `_KpAoq` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 87 | `_Z2G9l` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `685e54fe32228032eecf1eec` | False |
| 88 | `_emSs0` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 89 | `_NN22S` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | True |
| 90 | `_9TQjH` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `belcorp_master_data` | `` | False |
| 91 | `_Yxmvq` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 92 | `dPeYi` | ACTION | Execute REST multipart request | `custom_http_endpoint_execute_multipart` | `` | `` | False |
| 93 | `hGMfa` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 94 | `_utFromHgm` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 95 | `0cowl` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 96 | `9riaN` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 97 | `JXydH` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 98 | `IJWTn` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 99 | `_WYgHR` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `685e54fe32228032eecf1eec` | False |
| 100 | `Km1ri` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 101 | `_utCountryDpy` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 102 | `TLCyQ` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | True |
| 103 | `_Z9pa0` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `676db02f0c93231c945eb607` | True |
| 104 | `_3c1hN` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_skill_type` | `` | True |
| 105 | `_Ox2JE` | IF_ELSE | Condition | `if_else_condition` | `` | `` | True |
| 106 | `_uBAaU` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `676dae390c93231c945e8d7d` | False |
| 107 | `n_lCS6i` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 108 | `VQbpb` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 109 | `swK5E` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 110 | `R0094` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_customer_number` | `` | False |
| 111 | `eUZsX` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 112 | `3qjM7` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 113 | `lSiZj` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 114 | `hTQrK` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 115 | `_ESvAP` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `belcorp_master_data` | `` | False |
| 116 | `_sCK6Y` | ACTION | Execute REST request | `custom_http_endpoint_execute` | `` | `` | False |
| 117 | `_ZHZI7` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 118 | `_2CTZS` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 119 | `_3FE12` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 120 | `_gd0x1` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `belcorp_master_data` | `` | False |
| 121 | `_uHnky` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 122 | `_dhh64` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 123 | `_Tcn9C` | BRANCH |  | `` | `` | `` | False |
| 124 | `_Tcn9C@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 125 | `_2UUu1` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 126 | `_Tcn9C@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 127 | `_sh33o` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 128 | `_Tcn9C@3` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 129 | `_6OYVv` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 130 | `_Tcn9C@4` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 131 | `_vPnJW` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 132 | `_Tcn9C@5` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 133 | `_gyQwd` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 134 | `_YMUCe` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 135 | `n_Kiyd3` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 136 | `n_Q0ZFf` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 137 | `n_RJUGF` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 138 | `n_mViDv` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 139 | `_XKj0A` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 140 | `xDKCA` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 141 | `vD20M` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 142 | `pb3Qd` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 143 | `Fr1fF` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 144 | `OmLxI` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 145 | `sHUJL` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 146 | `jYCUi` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 147 | `ynp5W` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 148 | `W5uiy` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 149 | `n_AmV1w` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `685e54fe32228032eecf1eec` | False |
| 150 | `OBpBP` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 151 | `n_TirBx` | ACTION | Update an existing record's fields | `storage_by_unifyapps_update_record_field` | `service_hub_case` | `` | False |
| 152 | `_pVLuX` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `belcorp_master_data` | `` | False |
| 153 | `_ZNRmc` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 154 | `n_uuAwE` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 155 | `n_YWFGk` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `69c17be209f85d3b486955fa` | True |
| 156 | `_BdrUE` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 157 | `_2jiMf` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 158 | `JfFZV` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 159 | `YnMgD` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67b2cf05598c960762f64713` | False |
| 160 | `_c0JBK` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 161 | `DLAWr` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 162 | `QrnUh` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 163 | `_xJUe0` | ACTION | Fetch User | `standard_entities_fetch_user` | `` | `` | False |
| 164 | `n_aaW5r` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 165 | `3E0oj` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 166 | `IKi88` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 167 | `CP8SO` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 168 | `0icYw` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 169 | `X0S5Q` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 170 | `xEYok` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `676aa6320c93231c941f0115` | False |
| 171 | `UBXpm` | ACTION | Create variables | `variable_by_unifyapps_create_variables` | `` | `` | False |
| 172 | `n_AlPwl` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 173 | `n_3Y9Yd` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 174 | `tUeES` | ACTION | Execute REST request | `custom_http_endpoint_execute` | `` | `` | False |
| 175 | `p9CYQ` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 176 | `Ztdva` | DELAY | Set delay duration | `delay_for` | `` | `` | True |
| 177 | `_cfOAz` | ACTION | Execute REST multipart request | `custom_http_endpoint_execute_multipart` | `` | `` | False |
| 178 | `oQ6VI` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 179 | `flUgx` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 180 | `SpxJg` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 181 | `IkDmA` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 182 | `MUXEV` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 183 | `qr8UT` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 184 | `2rHSU` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | False |
| 185 | `_lumBL` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `685e54fe32228032eecf1eec` | True |
| 186 | `bgCuI` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 187 | `_utCountryCfo` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 188 | `lE2yz` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 189 | `tpm8u` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 190 | `7AOx6` | ACTION | Execute Groovy code | `code_by_unifyapps_groovy` | `` | `` | False |
| 191 | `Ujb2M` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_customer_number` | `` | False |
| 192 | `3BsqV` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 193 | `9lZAQ` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 194 | `E7iMm` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 195 | `6MLGx` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 196 | `cVrQL` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `belcorp_master_data` | `` | False |
| 197 | `yj0Tt` | IF_ELSE | Condition | `if_else_condition` | `` | `` | False |
| 198 | `qQzTV` | ACTION | Update an existing record | `storage_by_unifyapps_update_record_by_id` | `belcorp_master_data` | `` | False |
| 199 | `Fp0ie` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 200 | `_xLY5V` | ACTION | Create record | `storage_by_unifyapps_create_record` | `belcorp_master_data` | `` | False |
| 201 | `3RjK3` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `service_hub_case` | `` | False |
| 202 | `LpiIo` | ACTION | Update variables | `variable_by_unifyapps_update_variables` | `` | `` | False |
| 203 | `0ZTms` | CALL_INTERFACE_WORKFLOW | Publish Response | `conv_ai_by_unifyapps_publish_response` | `` | `` | True |
| 204 | `_hR8um` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `685e54fe32228032eecf1eec` | True |
| 205 | `9cDOS` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |
| 206 | `oBPBn` | ACTION | Fetch records | `storage_by_unifyapps_fetch_records` | `service_hub_case` | `` | False |
| 207 | `62d3b` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `snowflake_case_level_2` | `` | False |
| 208 | `7sekS` | BRANCH |  | `` | `` | `` | False |
| 209 | `7sekS@1` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 210 | `zsO6z` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `67582028bfcac2349314ecfa` | False |
| 211 | `elmgr` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6752b5d674e2bf1fcf3d9dab` | False |
| 212 | `7sekS@2` | BRANCH_CONDITION |  | `branch_condition` | `` | `` | False |
| 213 | `8fEpP` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `677b8ead53fb3d1eefd95ba0` | False |
| 214 | `MglRN` | CALL_WORKFLOW | Call automation | `callables_call_automation` | `` | `6752b5d674e2bf1fcf3d9dab` | False |
| 215 | `n_ETXw9` | ACTION | Update records by query | `storage_by_unifyapps_update_records` | `belcorp_master_data` | `` | False |
| 216 | `_gDBps` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

<!-- source: 698edb1fbd2e947f513f67cf.json -->
## Cached hit status store 

| Campo | Valor |
|-------|-------|
| **ID** | `698edb1fbd2e947f513f67cf` |
| **lcName** | cached hit status store  |
| **Deploy** | v1 / wf v0 |
| **Definition** | `6a521a469a308f0d8f0b096f` |
| **Nodos / edges** | 3 / 2 |

### Objetos (`object_type`)
- `cached_status` — nodos: `n_A8sha`

### Orden aproximado de ejecución (BFS desde START por edges)

> Prioriza aristas `next` / ramas `yes` / `success` antes que `no` / `error`. No sustituye el grafo completo si hay loops.

1. **`n_OnU0N`** [START] Trigger via automation
2. **`n_A8sha`** [ACTION] Create record → `cached_status`
3. **`n_D9fYP`** [STOP] Respond to automation

### Tabla completa de nodos (orden índice builder)

| # | Node ID | Tipo | Título | Resource | Objeto | AutomationId | Skip |
|---|---------|------|--------|----------|--------|--------------|------|
| 1 | `n_OnU0N` | START | Trigger via automation | `callables_from_automation` | `` | `` | False |
| 2 | `n_A8sha` | ACTION | Create record | `storage_by_unifyapps_create_record` | `cached_status` | `` | False |
| 3 | `n_D9fYP` | STOP | Respond to automation | `callables_return_to_automation` | `` | `` | False |

---

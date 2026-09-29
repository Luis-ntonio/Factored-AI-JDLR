
### H1 · Llamadas que mencionan una tarjeta (entre los mentioned_products válidos): mezcla de motivos
contact_reason  con_tarjeta  sin_tarjeta
     Comercial           90          194
       Técnico          190          369
      Producto          283          536
 Transaccional          444          778
         Queja          187          386
     Retención           29           76

### H2a · Tras una compra con tarjeta DECLINADA, ¿llama más el cliente? (72h vs control)
 eventos  pct_con_contacto_post  pct_con_contacto_control  ratio
   77714                   1.21                      1.19   1.01

### H2b · Control negativo: tras una compra con tarjeta APROBADA (muestra 80k)
 eventos  pct_con_contacto_post  pct_con_contacto_control  ratio
   73559                   1.15                      1.22   0.94

### H2c · Motivos de las llamadas en las 72h tras una declinada vs mezcla global
contact_reason  pct_tras_evento  pct_global  n_tras_evento
 Transaccional             34.3        35.0            323
      Producto             22.6        22.0            213
         Queja             18.5        17.1            174
       Técnico             13.0        15.0            122
     Comercial              9.0         8.0             85
     Retención              2.7         3.0             25

### H3a · Tras una transacción FRAUDULENTA, ¿llama más? (7 días)
 eventos  pct_con_contacto_post  pct_con_contacto_control  ratio
    4316                   3.17                      2.71   1.17

### H3b · Tras una transacción FRAUDULENTA, ¿reclama más? (30 días)
 eventos  pct_con_contacto_post  pct_con_contacto_control  ratio
    4316                   0.93                      0.76   1.21

### H3c · Subcategoría de quejas en los 30 días tras un fraude
                 sub  n  pct_tras_fraude  pct_global
      Cobro indebido 10             25.0        18.2
Atención en sucursal  9             22.5        17.7
 Cargo no reconocido  8             20.0        18.3
 Calidad de servicio  5             12.5        17.7
    Problema con app  4             10.0        18.1
                NULL  4             10.0        10.0

### H4 · Tras un REVERSO, ¿reclama más? (30 días)
 eventos  pct_con_contacto_post  pct_con_contacto_control  ratio
   44750                    1.3                      1.16   1.12

### H5a · Tras un Error digital en la página de tarjeta de crédito, ¿llama más? (24h)
 eventos  pct_con_contacto_post  pct_con_contacto_control  ratio
       0                    NaN                       NaN    NaN

### H5b · Tras cualquier Error digital (muestra 80k), ¿llama más? (24h)
 eventos  pct_con_contacto_post  pct_con_contacto_control  ratio
    1398                   0.36                      0.36    1.0

### H6 · Clientes con tarjeta bloqueada/suspendida vs activa: contactos por cliente y motivos
                      g  clientes  contactos_x_cliente  quejas_x_cliente
solo_activas_o_cerradas     81484                4.580             0.781
      tarjeta_bloq_susp      9600                4.587             0.777

### H7 · Clientes con vs sin tarjeta: contactos por cliente y % Queja
 tiene_tarjeta  clientes  contactos_x_cliente  pct_queja
          True     91084                4.580       17.1
         False     58916                4.567       17.1

### H8 · Apertura del transcript ('tarjeta de crédito' vs 'cuenta de ahorros') vs si el cliente tiene tarjeta de crédito
        apertura     n  pct_tiene_tc
habla_de_tarjeta 85910          48.8
habla_de_ahorros 85411          48.9

### H9 · Tarjeta de crédito en mora (days_past_due > 0) vs al día: contactos y motivos Comercial/Retención
      g  clientes  contactos_x_cliente  pct_comercial_retencion
en_mora     13556                4.600                     10.9
 al_dia     56939                4.577                     11.0

### H10 · A nivel cliente: correlación de Spearman entre #declinadas de tarjeta y #llamadas Queja
 clientes  spearman_decl_vs_queja  spearman_decl_vs_contactos
    91084                 -0.0014                     -0.0002


### Interacciones por motivo de contacto
contact_reason      n  pct  fcr  escal  followup   sent  dur_p50  wait_p50
 Transaccional 240056 35.0 91.5    9.9      22.1 -0.000    205.0     119.0
      Producto 150863 22.0 89.6   10.0      23.8 -0.037    263.0     119.0
         Queja 117021 17.1 43.6   10.0      63.0 -0.067    431.0     120.0
       Técnico 102899 15.0 69.9   10.1      40.6 -0.067    360.0     119.0
     Comercial  54879  8.0 65.2    9.8      44.5 -0.066    540.0     120.0
     Retención  20578  3.0 60.2    9.8      49.1 -0.065    478.0     120.0

### Encuestas por motivo de contacto
contact_reason survey_type     n  avg_score
     Comercial         CES  1760       2.67
     Comercial        CSAT 10243       2.66
     Comercial         NPS  5144       4.95
      Producto         CES  4627       2.91
      Producto        CSAT 27942       2.90
      Producto         NPS 13997       5.69
         Queja         CES  3693       2.43
         Queja        CSAT 21843       2.43
         Queja         NPS 10821       4.33
     Retención         CES   640       2.62
     Retención        CSAT  3798       2.61
     Retención         NPS  1917       4.77
 Transaccional         CES  7354       2.91
 Transaccional        CSAT 44837       2.91
 Transaccional         NPS 22341       5.74
       Técnico         CES  3161       2.70
       Técnico        CSAT 19193       2.70
       Técnico         NPS  9448       5.14

### FCR por motivo x país
contact_reason  Argentina  Colombia  México
 Transaccional       91.6      91.5    91.5
         Queja       43.4      43.6    43.7
      Producto       89.6      89.8    89.6
     Retención       59.7      60.7    60.0
     Comercial       65.3      64.9    65.4
       Técnico       69.9      69.8    70.0

### FCR por motivo x segmento
contact_reason  Basic  Plus  Premium  Student
 Transaccional   91.5  91.4     91.6     91.5
         Queja   43.6  43.5     43.8     43.8
      Producto   89.6  89.7     89.2     90.1
     Retención   59.4  61.0     62.7     59.7
     Comercial   65.4  64.6     66.2     63.9
       Técnico   69.8  70.3     69.9     69.3

### Estacionalidad mensual por motivo (CV = std/media)
contact_reason  min_mes  max_mes  media_mes    cv
 Transaccional     6040     7172     6661.0 0.039
      Producto     3795     4489     4184.0 0.034
         Queja     2918     3437     3241.0 0.038
       Técnico     2564     3101     2854.0 0.040
     Comercial     1361     1623     1524.0 0.040
     Retención      488      629      569.0 0.060

### Quejas: categoría x subcategoría
    category  Atención en sucursal  Calidad de servicio  Cargo no reconocido  Cobro indebido  NULL  Problema con app
     Service                     0                11886                    0               0  1308                 0
        Fees                     0                    0                    0           12194  1359                 0
      Branch                 11892                    0                    0               0  1469                 0
Transactions                     0                    0                12297               0  1283                 0
   Technical                     0                    0                    0               0  1279             12128

### Quejas por subcategoría
                 sub     n  sla_breach  res_days_p50  high_crit  repeat_  comp_pct  regulator
 Cargo no reconocido 12297        20.4          15.0       19.7     14.7       7.4       1.12
      Cobro indebido 12194        19.9          16.0       19.6     15.3       6.9       1.02
    Problema con app 12128        20.0          16.0       19.9     15.4       6.7       0.96
Atención en sucursal 11892        20.4          16.0       20.2     15.2       7.0       1.06
 Calidad de servicio 11886        20.3          16.0       19.5     15.0       6.7       1.18
                NULL  6698        19.3          16.0       19.3     14.3       6.6       1.09

### Quejas: producto afectado x subcategoría
               ptype     n  cargo_no_rec  cobro_indebido
      (sin producto) 22525          4154            4080
       Cuenta Ahorro 13517          2410            2456
    Cuenta Corriente 11224          2169            1992
     Tarjeta Crédito 11064          1962            2018
      Tarjeta Débito  4422           810             815
   Préstamo Personal  2169           385             418
Préstamo Hipotecario  1324           253             248
           Inversión   633           114             131
              Seguro   217            40              36

### Queja: el producto afectado pertenece al cliente que reclama
    n  mismo_duenio
44570             0

### Transacción: el producto pertenece al cliente de la transacción
      n  mismo_duenio
4425008       4425008

### Queja con transacción en el producto afectado (30 días previos)
                 sub    n  pct_con_txn  pct_con_fraude  pct_monto_coincide
 Cargo no reconocido 8143         25.9            0.06                 0.0
      Cobro indebido 8114         25.2            0.02                 0.0
    Problema con app 8068         24.0            0.09                 0.0
 Calidad de servicio 7956         25.4            0.01                 0.0
Atención en sucursal 7855         24.6            0.01                 0.0
                NULL 4434         24.7            0.00                 0.0

### Interacción seguida de queja del mismo cliente (7 días)
contact_reason      n  pct_con_queja
 Transaccional 240056            0.3
      Producto 150863            0.3
         Queja 117021            0.3
       Técnico 102899            0.3
     Comercial  54879            0.3
     Retención  20578            0.3

### mentioned_products que existen en products
     n  existentes
548680        3562

### Transacciones por tipo de producto: estado y fraude
        product_type       n  pct_declinada  pct_reversada  pct_fraude
       Cuenta Ahorro 1330133           4.99           1.01       0.095
     Tarjeta Crédito 1108285           5.02           1.02       0.100
    Cuenta Corriente 1107123           4.97           1.00       0.096
      Tarjeta Débito  439147           5.02           1.02       0.100
   Préstamo Personal  221164           5.06           1.00       0.104
Préstamo Hipotecario  131385           4.94           1.02       0.101
           Inversión   65065           5.05           1.06       0.095
              Seguro   22706           5.20           0.99       0.092

### Tipo de transacción por tipo de producto
        product_type  Adjustment  Deposit  Payment  Purchase  Transfer  Withdrawal
     Tarjeta Crédito           0        0   165838    775834         0      166613
           Inversión       19577        0    39121         0      6367           0
   Préstamo Personal       66330        0   132653         0     22181           0
Préstamo Hipotecario       39352        0    78908         0     13125           0
    Cuenta Corriente           0   277206   110234         0    386990      332693
      Tarjeta Débito           0        0    65796    307572         0       65779
       Cuenta Ahorro           0   332203   132835         0    465507      399588
              Seguro        6859        0    13579         0      2268           0

### Código de respuesta x estado (no aprobadas)
response_code transaction_status     n
           05           Declined 52246
           05            Pending 21191
           05           Reversed 10704
           14           Declined 52711
           14            Pending 21096
           14           Reversed 10665
           51           Declined 52788
           51            Pending 20911
           51           Reversed 10480
           54           Declined 52527
           54            Pending 20753
           54           Reversed 10591
         None           Declined 10962
         None            Pending  4392
         None           Reversed  2310

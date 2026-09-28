# Reporte de evaluación — clasificador de fraude entrenado

Held-out set: 885002 transacciones (782 fraude real, 0.088%).
Threshold de decisión del modelo: 0.53 (elegido maximizando F1 sobre una validación interna de train, nunca sobre este held-out -- ver train.py, best_threshold_for_f1).

## Métricas held-out (modelo vs. 2 baselines)

| Métrica | Modelo entrenado | Baseline: threshold sobre fraud_score existente | Baseline: clase mayoritaria |
| --- | --- | --- | --- |
| Precision | 0.0009 | 1.0000 | 0.0000 |
| Recall | 0.0448 | 0.5652 | 0.0000 |
| F1 | 0.0019 | 0.7222 | 0.0000 |
| PR-AUC | 0.0009 | 0.5716 | None |

## Conclusión

**El modelo entrenado NO supera al baseline `fraud_score`** (F1 0.0019 vs. 0.7222; PR-AUC 0.0009 vs. 0.5716). Reportado honestamente en vez de ocultado -- ver diagnóstico in-sample abajo, que descarta que sea un bug de pipeline: el problema no es de generalización, es que las features disponibles (sin `fraud_score`, ver `features.py`) no predicen `is_fraud` mejor que el azar en este dataset. Se probaron 2 familias de modelo (regresión logística y gradient boosting) con el mismo resultado. Recomendación: para producción, un threshold auditable sobre `fraud_score` (el baseline que gana acá) es más simple Y más efectivo que el modelo entrenado -- mismo criterio de "fórmula auditable sobre modelo oculto" que ya usa `compute-score.ts` en el flujo de eligibility.

**Diagnóstico in-sample** (¿bug de pipeline o falta de señal real?): sobre 200000 filas de TRAIN que el modelo SÍ vio al entrenar, PR-AUC = 0.0020 contra un base rate de 0.00096 -- prácticamente sin separación ni siquiera memorizando el propio set de entrenamiento. Esto descarta un bug de generalización/overfitting: es evidencia de que la señal simplemente no está en estas features.

## Matrices de confusión

- Modelo: TP=35 FP=36857 FN=747 TN=847363
- Baseline fraud_score (threshold=30.5, elegido sobre TRAIN, nunca sobre held-out): TP=442 FP=0 FN=340 TN=884220
- Baseline clase mayoritaria: TP=0 FP=0 FN=782 TN=884220

## Análisis de errores — falsos negativos del modelo (fraude NO detectado, el fallo caro)

747 caso(s) -- muestra de los primeros 20:

| transaction_id           | customer_id      |           amount | transaction_country   | merchant_category   |
|:-------------------------|:-----------------|-----------------:|:----------------------|:--------------------|
| TRX-G2IHZ6OU48JOS29J8MYU | CLI-EYFA30TBTI7I |      1.92371e+07 | Colombia              | nan                 |
| TRX-5GVE8NXNNKH9BM1WKCOE | CLI-2ZZQSV2C27BW |   5604.19        | México                | nan                 |
| TRX-NUUJC602JX0ZWM97LBRV | CLI-V9768VNH12FC |   1582.86        | México                | nan                 |
| TRX-OLOVGM6XYKM66ZS08N6F | CLI-KOU6EPGRQ0R4 |     66.85        | México                | nan                 |
| TRX-B52MUVEIEEMWY9ZG0S2O | CLI-INB7F1EOE5MB |      1.40586e+06 | Colombia              | nan                 |
| TRX-RJQMJHRD7F3LDX0RK98T | CLI-7PTSN8CA5TDN |    824.74        | México                | nan                 |
| TRX-YGVAJH29A7BGLFTF6MYT | CLI-5IRIG8YMNFJ1 |    294.26        | México                | nan                 |
| TRX-SLX389KFMC2TMPRVPRTT | CLI-RAI5W2FPB8JV |   1058.58        | México                | nan                 |
| TRX-3RK1CBIZY7TF9DMDW8DI | CLI-EAPEFCDC7WPM |    372.64        | México                | nan                 |
| TRX-40C9A0Q7SH6X2WVYKKCX | CLI-EHLXXYJFFJU5 |      2.03803e+06 | Argentina             | nan                 |
| TRX-ACVY6B28ZKF192PS7CU2 | CLI-TL016PWBHD6A |    126.67        | México                | Food                |
| TRX-I3Y5U74016LRL7W3ZUPW | CLI-M8MOXPK5Y0WJ |     61.14        | Colombia              | nan                 |
| TRX-959IV1AE2OMCIQ051D2R | CLI-2JGRUG5IV3SL |    189.4         | México                | Food                |
| TRX-0FKATKC4TSUYBYIVKKWJ | CLI-BJ7S5JN21K0T | 121337           | Argentina             | Transport           |
| TRX-EBPX5QTUA19XYPFRL6S1 | CLI-XZ4NH8U2D520 |    320.49        | México                | nan                 |
| TRX-CINEWUO57BHH984AUK1A | CLI-C9FKUUGGGER3 |   6143.99        | México                | nan                 |
| TRX-G0NH1J7NTQOHY9002C8Z | CLI-9MQ866KQ60ZQ |      3.99634e+07 | Colombia              | nan                 |
| TRX-DU1OMPJGNPK68DVI919H | CLI-NIVXW8CRJJUA |   1919.66        | México                | nan                 |
| TRX-F6JIZ72EGYUNAQB911V7 | CLI-15H07G225K2G |      1.92175e+06 | Colombia              | Food                |
| TRX-GUVLIKU9KWZVEX79B3WF | CLI-1PEBBVPF01M5 |   8111.33        | México                | nan                 |

## Limitaciones declaradas

- Split temporal sin exclusión estricta por `customer_id` (ver `split.py`) — un cliente puede aparecer en ambos lados del corte.
- `fraud_score` se usó SOLO como baseline (threshold), nunca como feature de entrada del modelo nuevo (ver `features.py`).
- Una sola corrida de train/test — sin validación cruzada ni intervalos de confianza sobre las métricas.

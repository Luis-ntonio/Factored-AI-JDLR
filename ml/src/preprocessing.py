"""
Helpers de preprocesamiento usados dentro del Pipeline de scikit-learn
entrenado en `train.py`. Viven en un módulo PROPIO (nunca dentro de
`train.py`/`evaluate.py`) a propósito: si una función usada por un
`FunctionTransformer` queda definida en un módulo ejecutado como
`__main__` (`python -m src.train`), pickle la serializa como
`__main__.<nombre>` y `evaluate.py` (que importa el .pkl desde OTRO
proceso, donde ese módulo nunca es `__main__`) no puede deserializarla
-- error real encontrado en el smoke test de este pipeline.
"""


def bool_to_float(x):
    return x.astype(float)

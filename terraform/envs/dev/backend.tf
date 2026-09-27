# Backend de state: LOCAL en este checkpoint (limitación conocida — ver
# terraform/README.md, sección "Limitaciones de este checkpoint").
#
# No hay bloque `backend` aquí a propósito: sin argumentos, Terraform usa el
# backend "local" por defecto (terraform.tfstate en este directorio).
#
# Antes de que más de una persona toque esta infra, o antes del checkpoint
# final, migrar a backend remoto S3 + DynamoDB lock, por ejemplo:
#
# terraform {
#   backend "s3" {
#     bucket         = "<project>-tfstate-<account_id>"
#     key            = "envs/dev/terraform.tfstate"
#     region         = "us-east-1"
#     dynamodb_table = "<project>-tfstate-lock"
#     encrypt        = true
#   }
# }
#
# Ese bucket + tabla de lock no existen todavía (bootstrap problem: no se
# pueden crear con el mismo Terraform que los va a usar de backend) — se
# crearían con un `terraform apply` aparte (o a mano) antes de habilitar este
# bloque.

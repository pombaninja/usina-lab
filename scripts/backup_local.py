# -*- coding: utf-8 -*-
"""Backup local diário do banco Usina-Lab (Supabase) para o drive T:.

Exporta todas as tabelas do schema public para CSV + um resumo .xlsx,
em pasta datada. Mantém os últimos RETENCAO_DIAS dias.

Agendado via Tarefas do Windows (schtasks). A URL do banco é lida de
C:\\Projetos\\usina-lab\\.backup.env (arquivo local, fora do git).
"""
import csv
import datetime
import io
import shutil
import sys
from pathlib import Path

import psycopg
from openpyxl import Workbook

ENV_FILE = Path(r"C:\Projetos\usina-lab\.backup.env")
DESTINO_BASE = Path(r"T:\Diretoria\Henrique\4. ADM\Programa Usina  - Laboratorio\Backups\usina-lab")
RETENCAO_DIAS = 60


def carregar_db_url() -> str:
    for linha in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if linha.startswith("DB_URL="):
            return linha.split("=", 1)[1].strip()
    raise RuntimeError("DB_URL não encontrada em .backup.env")


def main() -> int:
    hoje = datetime.date.today().isoformat()
    destino = DESTINO_BASE / hoje
    destino.mkdir(parents=True, exist_ok=True)

    wb = Workbook()
    resumo = wb.active
    resumo.title = "Resumo"
    resumo.append(["Tabela", "Linhas", "Arquivo CSV"])

    with psycopg.connect(carregar_db_url()) as con:
        tabelas = [
            r[0]
            for r in con.execute(
                "select table_name from information_schema.tables "
                "where table_schema = 'public' and table_type = 'BASE TABLE' "
                "order by table_name"
            ).fetchall()
        ]
        for tabela in tabelas:
            buf = io.StringIO()
            with con.cursor().copy(
                f'copy (select * from public."{tabela}") to stdout with (format csv, header)'
            ) as cp:
                for dados in cp:
                    buf.write(bytes(dados).decode("utf-8"))
            arquivo = destino / f"{tabela}.csv"
            arquivo.write_text(buf.getvalue(), encoding="utf-8-sig")
            linhas = max(0, buf.getvalue().count("\n") - 1)
            resumo.append([tabela, linhas, arquivo.name])
            print(f"  {tabela}: {linhas} linhas")

    wb.save(destino / f"resumo-backup-{hoje}.xlsx")
    print(f"Backup salvo em: {destino}")

    # Retenção: apaga pastas datadas mais antigas que RETENCAO_DIAS
    limite = datetime.date.today() - datetime.timedelta(days=RETENCAO_DIAS)
    for pasta in DESTINO_BASE.iterdir():
        try:
            if pasta.is_dir() and datetime.date.fromisoformat(pasta.name) < limite:
                shutil.rmtree(pasta)
                print(f"Removido backup antigo: {pasta.name}")
        except ValueError:
            continue  # pasta com nome fora do padrão de data — ignora
    return 0


if __name__ == "__main__":
    sys.exit(main())

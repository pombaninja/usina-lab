# -*- coding: utf-8 -*-
"""Verificação de integridade do fluxo de revisão de laudos (Usina-Lab).

Roda ao vivo contra o banco de produção (Supabase), criando e removendo
linhas de teste na faixa seq 996 / numero prefixo 'VERIF-INT-'. Não deve
deixar nenhum resíduo, mesmo em caso de falha (try/finally).

ATENÇÃO: a limpeza desativa temporariamente os triggers de imutabilidade
(trg_laudo_imutavel / trg_lock_*) NA TABELA INTEIRA por alguns instantes.
Execute preferencialmente fora do horário de uso do laboratório e nunca
em paralelo com outra sessão editando laudos.

A URL do banco é lida de C:\\Projetos\\usina-lab\\.backup.env (mesmo padrão
usado por scripts/backup_local.py).

Testes:
  1. Ensaio de laudo Rev. 0 emitido -> UPDATE no ensaio é bloqueado.
  2. Rev. 1 (rascunho) criada -> UPDATE no ensaio passa a ser permitido.
  3. emitir_laudo(rev1), impersonando usina@gruporibeiroporto.com via
     set_config('request.jwt.claims', ...) -> retorna o MESMO número do
     laudo original.
  4. Rev. 1 emitida -> UPDATE no ensaio volta a ser bloqueado.
  5. INSERT de uma segunda linha com (ensaio_id, revisao) duplicados ->
     rejeitado pelo índice único laudos_ensaio_revisao_unq.
  6. Laudo "forjado" com laudo_original_id apontando para um laudo emitido
     de OUTRO ensaio -> emitir_laudo levanta exceção "inválido".

Cada checagem imprime OK/FALHOU. Sai com código 1 se qualquer uma falhar.
"""
import sys
import uuid
from pathlib import Path

import psycopg

ENV_FILE = Path(r"C:\Projetos\usina-lab\.backup.env")
USINA_USER_EMAIL = "usina@gruporibeiroporto.com"
SEQ_BASE = 996
NUMERO_PREFIX = "VERIF-INT-"


def carregar_db_url() -> str:
    for linha in ENV_FILE.read_text(encoding="utf-8").splitlines():
        if linha.startswith("DB_URL="):
            return linha.split("=", 1)[1].strip()
    raise RuntimeError("DB_URL não encontrada em .backup.env")


def set_jwt(cur, user_id) -> None:
    """Impersona um usuário para que auth.uid()/tem_papel() funcionem
    fora do PostgREST (mesma técnica usada na verificação anterior).

    A conexão roda em autocommit (cada statement é sua própria transação —
    necessário para que os testes de bloqueio esperado não abortem a sessão
    inteira), então o set_config precisa ser is_local=false (escopo de
    sessão) para sobreviver entre um cur.execute() e o próximo."""
    claims = '{"sub": "%s", "role": "authenticated"}' % user_id
    cur.execute("select set_config('request.jwt.claims', %s, false)", (claims,))


def clear_jwt(cur) -> None:
    cur.execute("select set_config('request.jwt.claims', '', false)")
    cur.execute("reset role")


class Resultado:
    def __init__(self):
        self.checks = []

    def registrar(self, nome: str, ok: bool, detalhe: str = "") -> None:
        self.checks.append((nome, ok, detalhe))
        status = "OK" if ok else "FALHOU"
        linha = f"[{status}] {nome}"
        if detalhe:
            linha += f" — {detalhe}"
        print(linha)

    def resumo(self) -> bool:
        total = len(self.checks)
        oks = sum(1 for _, ok, _ in self.checks if ok)
        print(f"\nResumo: {oks}/{total} OK")
        return oks == total


def main() -> int:
    db_url = carregar_db_url()
    resultado = Resultado()

    # IDs de teste, previsíveis para facilitar cleanup manual em caso de falha grave.
    ensaio_a_id = None
    ensaio_b_id = None
    laudo_rev0_id = None
    laudo_rev1_id = None
    laudo_b_id = None
    laudo_forjado_id = None
    dosagem_id = None
    empresa_id = None
    usina_user_id = None

    con = psycopg.connect(db_url, autocommit=True)
    try:
        with con.cursor() as cur:
            cur.execute("select id from auth.users where email = %s", (USINA_USER_EMAIL,))
            row = cur.fetchone()
            if not row:
                raise RuntimeError(f"Usuário de teste {USINA_USER_EMAIL} não encontrado")
            usina_user_id = row[0]

            cur.execute("select id, empresa_id from dosagens where ativa limit 1")
            row = cur.fetchone()
            if not row:
                raise RuntimeError("Nenhuma dosagem ativa encontrada para montar o cenário de teste")
            dosagem_id, empresa_id = row

            # ---- Setup: dois ensaios (A para a cadeia principal, B para o laudo "âncora" do teste 6) ----
            cur.execute(
                """
                insert into ensaios_cauq (empresa_id, dosagem_id, data, resultados)
                values (%s, %s, current_date, '{}'::jsonb)
                returning id
                """,
                (empresa_id, dosagem_id),
            )
            ensaio_a_id = cur.fetchone()[0]

            cur.execute(
                """
                insert into ensaios_cauq (empresa_id, dosagem_id, data, resultados)
                values (%s, %s, current_date, '{}'::jsonb)
                returning id
                """,
                (empresa_id, dosagem_id),
            )
            ensaio_b_id = cur.fetchone()[0]

            numero_a = f"{NUMERO_PREFIX}{SEQ_BASE}"
            numero_b = f"{NUMERO_PREFIX}{SEQ_BASE + 1}"

            # Laudo A Rev. 0, já emitido diretamente (bypass de emitir_laudo — é só para montar o cenário)
            cur.execute(
                """
                insert into laudos (empresa_id, ensaio_id, ano, seq, numero, revisao, status, emitido_em)
                values (%s, %s, extract(year from now())::int, %s, %s, 0, 'emitido', now())
                returning id
                """,
                (empresa_id, ensaio_a_id, SEQ_BASE, numero_a),
            )
            laudo_rev0_id = cur.fetchone()[0]

            # Laudo B, emitido, em um ensaio DIFERENTE — usado como "original" forjado no teste 6
            cur.execute(
                """
                insert into laudos (empresa_id, ensaio_id, ano, seq, numero, revisao, status, emitido_em)
                values (%s, %s, extract(year from now())::int, %s, %s, 0, 'emitido', now())
                returning id
                """,
                (empresa_id, ensaio_b_id, SEQ_BASE + 1, numero_b),
            )
            laudo_b_id = cur.fetchone()[0]

            # --- Teste 1: ensaio de laudo emitido (Rev. 0) -> UPDATE bloqueado ---
            try:
                cur.execute(
                    "update ensaios_cauq set observacoes = 'tentativa bloqueada' where id = %s",
                    (ensaio_a_id,),
                )
                resultado.registrar(
                    "1. UPDATE em ensaio de Rev.0 emitido é bloqueado", False, "UPDATE não levantou exceção"
                )
            except psycopg.errors.RaiseException as e:
                bloqueado = "imutável" in str(e) or "imutavel" in str(e)
                resultado.registrar("1. UPDATE em ensaio de Rev.0 emitido é bloqueado", bloqueado, str(e).strip())

            # --- Teste 2: cria Rev. 1 (rascunho) -> UPDATE volta a ser permitido ---
            cur.execute(
                """
                insert into laudos (empresa_id, ensaio_id, ano, seq, numero, revisao, laudo_original_id, status)
                values (%s, %s, extract(year from now())::int, %s, %s, 1, %s, 'aprovado')
                returning id
                """,
                (empresa_id, ensaio_a_id, SEQ_BASE, numero_a, laudo_rev0_id),
            )
            laudo_rev1_id = cur.fetchone()[0]

            try:
                cur.execute(
                    "update ensaios_cauq set observacoes = 'edicao permitida rev1' where id = %s",
                    (ensaio_a_id,),
                )
                resultado.registrar("2. UPDATE em ensaio com Rev.1 rascunho é permitido", True)
            except psycopg.errors.RaiseException as e:
                resultado.registrar("2. UPDATE em ensaio com Rev.1 rascunho é permitido", False, str(e).strip())

            # --- Teste 3: emitir_laudo(rev1) impersonado -> mesmo número do original ---
            set_jwt(cur, usina_user_id)
            try:
                cur.execute("select emitir_laudo(%s)", (laudo_rev1_id,))
                numero_emitido = cur.fetchone()[0]
                resultado.registrar(
                    "3. emitir_laudo(Rev.1) retorna o mesmo numero do original",
                    numero_emitido == numero_a,
                    f"esperado={numero_a} obtido={numero_emitido}",
                )
            except psycopg.errors.RaiseException as e:
                resultado.registrar("3. emitir_laudo(Rev.1) retorna o mesmo numero do original", False, str(e).strip())
            finally:
                clear_jwt(cur)

            # --- Teste 4: Rev. 1 agora emitida -> UPDATE bloqueado de novo ---
            try:
                cur.execute(
                    "update ensaios_cauq set observacoes = 'tentativa bloqueada rev1 emitida' where id = %s",
                    (ensaio_a_id,),
                )
                resultado.registrar(
                    "4. UPDATE em ensaio com Rev.1 emitida é bloqueado novamente", False, "UPDATE não levantou exceção"
                )
            except psycopg.errors.RaiseException as e:
                bloqueado = "imutável" in str(e) or "imutavel" in str(e)
                resultado.registrar(
                    "4. UPDATE em ensaio com Rev.1 emitida é bloqueado novamente", bloqueado, str(e).strip()
                )

            # --- Teste 5: duplicar (ensaio_id, revisao) -> rejeitado pelo índice único ---
            try:
                cur.execute(
                    """
                    insert into laudos (empresa_id, ensaio_id, ano, seq, numero, revisao, status)
                    values (%s, %s, extract(year from now())::int, %s, %s, 1, 'rascunho')
                    """,
                    (empresa_id, ensaio_a_id, SEQ_BASE, numero_a + "-DUP"),
                )
                resultado.registrar(
                    "5. INSERT duplicado (ensaio_id, revisao) é rejeitado", False, "INSERT não levantou exceção"
                )
            except psycopg.errors.UniqueViolation as e:
                resultado.registrar("5. INSERT duplicado (ensaio_id, revisao) é rejeitado", True, str(e).strip())

            # --- Teste 6: laudo forjado com laudo_original_id de OUTRO ensaio -> emitir_laudo rejeita ---
            # revisao=2 (não 1) para não colidir com a Rev.1 já usada em ensaio_a_id nos testes 2-5
            cur.execute(
                """
                insert into laudos (empresa_id, ensaio_id, ano, seq, numero, revisao, laudo_original_id, status)
                values (%s, %s, extract(year from now())::int, %s, %s, 2, %s, 'aprovado')
                returning id
                """,
                (empresa_id, ensaio_a_id, SEQ_BASE, numero_a + "-FORJADO", laudo_b_id),
            )
            laudo_forjado_id = cur.fetchone()[0]

            set_jwt(cur, usina_user_id)
            try:
                cur.execute("select emitir_laudo(%s)", (laudo_forjado_id,))
                resultado.registrar(
                    "6. emitir_laudo com laudo_original_id de outro ensaio é rejeitado",
                    False,
                    "emitir_laudo não levantou exceção",
                )
            except psycopg.errors.RaiseException as e:
                invalido = "inválido" in str(e) or "invalido" in str(e)
                resultado.registrar(
                    "6. emitir_laudo com laudo_original_id de outro ensaio é rejeitado", invalido, str(e).strip()
                )
            finally:
                clear_jwt(cur)

    finally:
        # Cleanup completo, mesmo em caso de falha: desliga os triggers de imutabilidade
        # temporariamente para poder apagar as linhas de teste (que podem estar emitidas).
        try:
            with con.cursor() as cur:
                cur.execute("alter table laudos disable trigger trg_laudo_imutavel")
                cur.execute("alter table ensaios_cauq disable trigger trg_lock_ensaio")

                # apaga por numero (prefixo de teste) e por ensaio_id, para cobrir
                # qualquer linha de teste independentemente de onde a falha ocorreu
                cur.execute("delete from laudos where numero like %s", (f"{NUMERO_PREFIX}%",))
                for eid in (ensaio_a_id, ensaio_b_id):
                    if eid is not None:
                        cur.execute("delete from laudos where ensaio_id = %s", (eid,))
                for eid in (ensaio_a_id, ensaio_b_id):
                    if eid is not None:
                        cur.execute("delete from ensaios_cauq where id = %s", (eid,))

                cur.execute("alter table ensaios_cauq enable trigger trg_lock_ensaio")
                cur.execute("alter table laudos enable trigger trg_laudo_imutavel")

                cur.execute(
                    "select count(*) from laudos where numero like %s", (f"{NUMERO_PREFIX}%",)
                )
                restantes_laudos = cur.fetchone()[0]
                ids_validos = [e for e in (ensaio_a_id, ensaio_b_id) if e is not None]
                if ids_validos:
                    cur.execute(
                        "select count(*) from ensaios_cauq where id = any(%s)", (ids_validos,)
                    )
                    restantes_ensaios = cur.fetchone()[0]
                else:
                    restantes_ensaios = 0
                if restantes_laudos == 0 and restantes_ensaios == 0:
                    print("\nOK: cleanup concluido (0 linhas de teste restantes)")
                else:
                    print(
                        f"\nATENCAO: cleanup incompleto — laudos={restantes_laudos} ensaios={restantes_ensaios}"
                    )
        finally:
            con.close()

    ok = resultado.resumo()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

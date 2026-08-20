# Deco Investimentos — Site Institucional

Site institucional da **Deco Investimentos** publicado via **GitHub Pages** em
[https://www.decoinvestimentos.com.br](https://www.decoinvestimentos.com.br).

## Como funciona

| Pasta | Conteúdo |
|---|---|
| `assets/` | Template do site (`Deco Investimentos - Site.html`) + app do site (`site-app.js`) |
| `site-data/` | Dados **criptografados** exportados do DecoAI (`data.json`) — sem senha, sem dados em texto puro |
| `scripts/` | `build-site.js` — gera `docs/index.html` embutindo os dados e o app no template |
| `.github/workflows/` | `deploy-site.yml` — publica o site a cada push em `main` (ou manualmente) |

## Atualizando os dados das carteiras

Os dados são gerados localmente pelo app **DecoAI** (pasta `database/`, que nunca é
versionada no GitHub). Para publicar atualizações:

1. Na máquina com o DecoAI, rode o exportador:

   ```bat
   node "scripts/export-site-data.js"
   ```

   Ele lê `database/portfolios/*` e o `projections_master.csv` e gera o `data.json`
   com os dados **criptografados** das carteiras.

2. Copie o `site-data/data.json` gerado para este repositório:

   ```bat
   copy /Y <caminho>\site-data\data.json site-data\data.json
   ```

3. Publique:

   ```bat
   git add site-data
   git commit -m "Atualiza dados das carteiras"
   git push
   ```

O workflow detecta a alteração, gera o HTML e publica automaticamente. Também é
possível acionar manualmente em **Actions → Deploy Site → Run workflow**.

## Acesso dos clientes

O botão **Login** no site abre uma modal. O cliente informa o usuário e a senha
guardados em `client_info.csv` (colunas `Login Gorila` / `Senha Gorila`).

**Esquema zero-knowledge:** os dados de cada cliente são criptografados com
**AES-256-GCM** usando uma chave derivada da senha via **PBKDF2-SHA256** (150 mil
iterações). O `data.json` público contém apenas o *ciphertext* (mais o login e o
*salt* — o login é necessário para o cliente se identificar). Nenhuma chave é
embutida no site: a senha digitada no login vira a chave de descriptografia no
navegador (Web Crypto). Senha correta → carteira aparece; senha errada → nada.

## Segurança

> ✅ **Confidencialidade:** mesmo quem baixe o `data.json` ou inspecione o HTML vê
> apenas criptografia — é impossível ler a carteira sem a senha do cliente.
>
> ⚠️ **Limitações a conhecer:**
> - O **login** (e-mail do cliente) fica em texto claro no arquivo — é a chave que
>   o cliente usa para se identificar.
> - As **projeções** (`projections_master.csv`) usadas no gráfico de estimativas
>   ficam em texto claro — são análises por ticker, não dados de carteira.
> - Autenticação 100% client-side é ofuscação: qualquer pessoa com a senha correta
>   acessa a carteira. Use senhas de acesso específicas para o site, nunca as senhas
>   reais da corretora.

## DNS

O domínio `www.decoinvestimentos.com.br` deve apontar via registro **CNAME** para:

```
andredinizbegio.github.io
```

Depois disso, o GitHub emite automaticamente o certificado HTTPS para o domínio.
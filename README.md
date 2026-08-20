# Deco Investimentos — Site Institucional

Site institucional da **Deco Investimentos** publicado via **GitHub Pages** em
[https://www.decoinvestimentos.com.br](https://www.decoinvestimentos.com.br).

## Como funciona

| Pasta | Conteúdo |
|---|---|
| `assets/` | Template do site (`Deco Investimentos - Site.html`) + app do site (`site-app.js`) |
| `site-data/` | Dados **sanitizados** exportados do DecoAI (`data.json`) — sem senhas em texto puro, apenas hash SHA-256 |
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
   com os dados das carteiras. As senhas entram apenas como hash SHA-256.

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
guardados em `client_info.csv` (colunas `Login Gorila` / `Senha Gorila`). A
validação é feita **localmente no navegador**, comparando o hash SHA-256 da senha
com o hash embutido no site. A carteira correspondente é renderizada com os mesmos
cards do app (posição atual, proventos, rentabilidade, tabela de posições etc.).

> ⚠️ **Importante:** por ser um site 100% estático, os dados das carteiras ficam
> embutidos no HTML e podem ser lidos por qualquer pessoa que inspecione o código
> da página. Não use senhas de corretora reais para essa finalidade — recomenda-se
> criar senhas de acesso específicas para o site ou migrar para autenticação com
> servidor no futuro.

## DNS

O domínio `www.decoinvestimentos.com.br` deve apontar via registro **CNAME** para:

```
andredinizbegio.github.io
```

Depois disso, o GitHub emite automaticamente o certificado HTTPS para o domínio.
# 🐙 Polvo V5

Checklist colaborativo em tempo real para equipes pequenas.

---

## Configuração (uma vez só)

### 1. Criar projeto no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Clique em **"Adicionar projeto"**
3. Dê um nome (ex: `polvo-v5`) e conclua o wizard
4. No painel do projeto, clique em **"</> Web"** para registrar um app web
5. Dê um apelido (ex: `polvo`) e clique em **Registrar**
6. Copie o bloco `firebaseConfig` que aparecer

### 2. Colar as configs no arquivo

Abra `firebase-config.js` e substitua os valores:

```js
export const FIREBASE_CONFIG = {
  apiKey:            "SUA_API_KEY",
  authDomain:        "SEU_PROJETO.firebaseapp.com",
  projectId:         "SEU_PROJETO_ID",
  ...
};
```

### 3. Ativar o Firestore

1. No Firebase Console → menu lateral → **Firestore Database**
2. Clique em **Criar banco de dados**
3. Escolha **Modo de teste** (libera acesso por 30 dias — suficiente para começar)
4. Escolha a região mais próxima (ex: `us-east1`) → Concluir

> Após os 30 dias, vá em **Regras** e cole:
> ```
> rules_version = '2';
> service cloud.firestore {
>   match /databases/{database}/documents {
>     match /{document=**} {
>       allow read, write: if true;
>     }
>   }
> }
> ```

### 4. Publicar no GitHub Pages

```bash
# Na pasta polvo-v5:
git init
git add .
git commit -m "Polvo V5 inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/polvo-v5.git
git push -u origin main
```

Depois no GitHub: **Settings → Pages → Source: main branch / root**

URL final: `https://SEU_USUARIO.github.io/polvo-v5`

---

## Como usar

| Ação | Como fazer |
|------|-----------|
| Novo card | Clique no `+` no cabeçalho da coluna |
| Renomear card | Clique direto no nome do card |
| Mover card | Arraste (linha pontilhada mostra onde vai cair) |
| Apagar card | Arraste para a lixeira que aparece no rodapé |
| Adicionar checklist | Botão ✓ no card |
| Indentar item | `Tab` / `Shift+Tab` dentro do item |
| Nova linha no checklist | `Enter` |
| Adicionar tabela | Botão ⊞ no card |
| Adicionar item em célula | Hover na célula → `+ item` |
| Recolher card | Clique na seta no canto do card |
| Scroll horizontal | `Shift + scroll` |
| Ir para hoje | Botão **Hoje** no topo |
| Redimensionar coluna | Arraste a borda direita da coluna |

---

## Membros e Projetos

- **Membros**: clique em *Membros* → adicione nome, foto e cor
- **Projetos**: clique em *Projetos* → adicione sigla, nome e cor
- Ao criar um card, escolha o projeto e os responsáveis
- A barra de progresso no topo do card reflete todos os checkboxes (lista + tabelas)

---

## Sincronização em tempo real

Qualquer alteração feita por um membro aparece automaticamente na tela dos outros,
sem precisar recarregar a página. Isso funciona via Firebase Firestore.

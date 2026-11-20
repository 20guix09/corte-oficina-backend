import { escapeHtml as esc } from "./report.js";

const eye = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const terms = '<a href="/informacoes.html#termos" target="_blank" rel="noopener">Termos de uso</a> e <a href="/informacoes.html#privacidade" target="_blank" rel="noopener">Política de privacidade</a>';
function input(name, title, type, auto, options = "") {
  const secret = type === "password";
  return `<div class="access-field"><label for="f-${name}">${title}</label><div class="input-line"><input id="f-${name}" name="${name}" type="${type}" autocomplete="${auto}" aria-describedby="msg-${name}" ${options}>${secret ? `<button type="button" class="eye" data-eye="${name}" aria-label="Mostrar ${title.toLowerCase()}" aria-pressed="false">${eye}</button>` : ""}</div><small id="msg-${name}" class="field-message"></small></div>`;
}
const views = {
  login:["Entrar na oficina", "Acesse os projetos e o estoque da sua empresa.", "Entrar", "Entrando…"],
  register:["Crie sua empresa", "Você será o primeiro administrador da oficina.", "Criar empresa", "Criando empresa…"],
  forgot:["Recuperar acesso", "Use o e-mail que você cadastrou na oficina.", "Enviar link", "Enviando…"],
  reset:["Escolha uma nova senha", "Use a nova senha no próximo acesso.", "Salvar nova senha", "Salvando…"]
};
function formatPhone(value) {
  const digits = value.replace(/\D/g, "").slice(0,11);
  if (!digits) return "";
  if (digits.length <= 2) return "(" + digits;
  const prefix = digits.length > 10 ? 7 : 6;
  return "(" + digits.slice(0,2) + ") " + digits.slice(2,prefix) + (digits.length > prefix ? "-" + digits.slice(prefix) : "");
}
export async function mountAccess(root, api, boot) {
  const hash = window.location.hash;
  const reset = hash.startsWith("#redefinir=") ? hash.slice("#redefinir=".length) : "";
  let mode = reset ? "reset" : "login", notice = hash === "#google-erro" ? "O acesso com Google foi interrompido. Tente novamente ou entre com sua senha." : "";
  let options = {google:false, mail:false};
  try { options = await api("/api/auth/options"); } catch {}
  const google = hash === "#google" ? options.pending : null;
  if (google) mode = google.existing ? "login" : "register";
  if (hash === "#google" && !google) notice = "Autorização expirada. Tente entrar com Google novamente.";
  if (hash === "#google" || hash === "#google-erro" || reset) window.history.replaceState(null,"",window.location.pathname + window.location.search);
  function render() {
    const [title,sub,action,busy] = views[mode];
    const signup = mode === "register", login = mode === "login", forgot = mode === "forgot", newPass = signup || mode === "reset";
    const linking = !!google && ((signup && !google.existing) || (login && google.existing));
    root.innerHTML = `<main class="auth"><section class="auth-hero">
      <div class="brand-line"><div class="logo"><span class="mark" aria-hidden="true"></span>Corte Oficina</div><span class="pilot-status" title="Planejamento e gestão de sobras disponíveis. Exportação Titanium em homologação.">Piloto</span></div>
      <div class="hero-body"><h1>Mais peça. <br>Mais sobra útil.</h1><p>Planeje o corte, ajuste as peças e encontre espaço para o próximo pedido.</p>
      <div class="sample-panel" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      <a class="demo-link" href="/exemplo-editor.html?projeto=promob">Explorar projeto de demonstração <span aria-hidden="true">↗</span></a></div>
      </section><section class="auth-box" aria-labelledby="access-title"><form id="auth-form" novalidate>
      <header><h2 id="access-title">${title}</h2><p class="muted">${linking ? (login ? "Confirme sua senha uma vez para vincular sua conta Google." : "Confirme os dados da oficina e defina uma senha alternativa.") : sub}</p></header>
      ${notice ? `<p class="access-notice" role="status">${esc(notice)}</p>` : ""}
      ${signup ? input("empresa","Nome da empresa","text","organization","required maxlength=120") + input("nome","Seu nome","text","name","required maxlength=120") + input("telefone","WhatsApp ou telefone (opcional)","tel","tel-national",'inputmode="tel" placeholder="(11) 99999-9999"') : ""}
      ${mode !== "reset" && (!forgot || options.mail) ? input("email","E-mail","email","username",linking ? `required readonly value="${esc(google.email)}"` : "required maxlength=180") : ""}
      ${login || newPass ? input("senha",newPass ? "Nova senha" : "Senha","password",newPass ? "new-password" : "current-password","required maxlength=128") : ""}
      ${newPass ? '<div id="length-rule" class="length-rule"><progress max="10" value="0" aria-label="Comprimento da senha"></progress><small>Mínimo de 10 caracteres</small></div>' + input("confirmar","Confirmar senha","password","new-password","required maxlength=128") : ""}
      ${login ? '<div class="access-options"><label class="check"><input type="checkbox" name="lembrar">Manter conectado neste computador</label><button type="button" class="link" data-mode="forgot">Esqueci minha senha</button></div>' : ""}
      ${signup ? `<label class="check consent"><input name="termos" type="checkbox" required><span>Li e aceito os ${terms}.</span></label><small class="field-message" id="msg-termos"></small>` : ""}
      ${forgot ? `<p class="access-notice">${options.mail ? "Você também pode" : "Para recuperar sua conta, você pode"} pedir um link ao administrador da oficina. Ele pode gerá-lo na tela Equipe.${options.mail ? "" : " Se você administra a oficina, fale com quem mantém a instalação para habilitar a recuperação por e-mail."}</p>` : ""}
      <div class="error" role="alert" id="auth-error" hidden></div>
      ${!forgot || options.mail ? `<button type="submit" class="primary wide">${action}</button>` : ""}
      ${options.google && (login || signup) && !linking ? '<a href="/api/auth/google/start" class="google-entry">Continuar com Google</a>' : ""}
      ${login ? '<div class="access-footer"><p>É dono ou gestor? <button type="button" class="link" id="toggle-auth" data-mode="register">Criar uma nova empresa</button></p><p>Trabalha em uma oficina que já usa o sistema? Peça seu acesso ao administrador.</p></div>' : '<button type="button" class="link back-link" data-mode="login">← Voltar para entrar</button>'}
      </form></section></main>`;
    const form = root.querySelector("form");
    const field = name => form.elements.namedItem(name);
    const message = (el, text) => {
      const hint = form.querySelector("#msg-" + el.name);
      if (hint) hint.textContent = text;
      el.setAttribute("aria-invalid", String(!!text));
    };
    const validate = el => {
      if (!el.name) return true;
      let problem = "";
      if (el.required && (el.type === "checkbox" ? !el.checked : !el.value.trim())) problem = el.type === "checkbox" ? "Confirme o aceite para continuar." : "Preencha este campo.";
      else if (el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim())) problem = "Digite um e-mail válido.";
      else if (el.name === "senha" && newPass && el.value.trim().length < 10) problem = "Use pelo menos 10 caracteres.";
      else if (el.name === "confirmar" && el.value !== field("senha").value) problem = "As senhas precisam ser iguais.";
      else if (el.name === "telefone" && el.value && el.value.replace(/\D/g,"").length < 10) problem = "Informe o telefone com DDD.";
      message(el, problem);
      return !problem;
    };
    for (const el of form.querySelectorAll("input")) {
      el.onblur = () => validate(el);
      el.oninput = () => {
        if (el.name === "telefone") el.value = formatPhone(el.value);
        if (el.name === "senha" && newPass) {
          const count = el.value.trim().length, rule = form.querySelector("#length-rule");
          rule.querySelector("progress").value = Math.min(count,10);
          rule.querySelector("small").textContent = count >= 10 ? "Comprimento suficiente" : count + " de 10 caracteres";
          rule.classList.toggle("met", count >= 10);
          if (field("confirmar").value) validate(field("confirmar"));
        }
        validate(el);
      };
    }
    form.querySelectorAll("[data-eye]").forEach(button => {
      button.onclick = () => {
        const el = field(button.dataset.eye), show = el.type === "password";
        el.type = show ? "text" : "password";
        button.setAttribute("aria-pressed", String(show));
        button.setAttribute("aria-label",(show ? "Ocultar " : "Mostrar ") + el.labels[0].textContent.toLowerCase());
      };
    });
    form.querySelectorAll("[data-mode]").forEach(button => button.onclick = () => {
      mode = button.dataset.mode; notice = ""; render();
      root.querySelector("#access-title").setAttribute("tabindex","-1");
      root.querySelector("#access-title").focus();
    });
    const entry = form.querySelector(".google-entry");
    if (entry && field("lembrar")) field("lembrar").onchange = () => { entry.href = "/api/auth/google/start?remember=" + Number(field("lembrar").checked); };
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector("[type=submit]");
      if (!button || button.disabled) return;
      const invalid = Array.from(form.querySelectorAll("input")).filter(el => !validate(el));
      if (invalid.length) return invalid[0].focus();
      const error = form.querySelector("#auth-error");
      error.hidden = true;
      const body = Object.fromEntries(new FormData(form));
      delete body.confirmar;
      if (login) body.lembrar = field("lembrar").checked;
      if (signup) body.termos = field("termos").checked;
      if (linking) body.vincularGoogle = true;
      if (mode === "reset") body.token = reset;
      button.disabled = true; button.textContent = busy; form.setAttribute("aria-busy","true");
      form.querySelectorAll("[data-mode]").forEach(b => b.disabled = true);
      try {
        const result = await api("/api/auth/" + mode, "POST", body);
        if (forgot || mode === "reset") { notice = result.mensagem; mode = "login"; render(); }
        else await boot();
      } catch (e) {
        const target = /já cadastrado|mail inválido/i.test(e.message) ? field("email") : /senha incorret/i.test(e.message) ? field("senha") : null;
        if (target) { message(target,e.message); target.focus(); }
        else { error.textContent = e.message; error.hidden = false; }
      } finally {
        button.disabled = false; button.textContent = action; form.removeAttribute("aria-busy");
        form.querySelectorAll("[data-mode]").forEach(b => b.disabled = false);
      }
    };
  }
  render();
}

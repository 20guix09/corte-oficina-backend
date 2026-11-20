from playwright.sync_api import sync_playwright
from pathlib import Path
import os
import socket
import subprocess
import time
from contextlib import contextmanager
from urllib.request import urlopen

@contextmanager
def servidor_de_teste():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    env = {**os.environ, "DB_PATH": ":memory:", "COOKIE_SECURE": "false", "APP_ORIGIN": base,
           "RESEND_API_KEY": "", "GOOGLE_CLIENT_ID": "", "GOOGLE_CLIENT_SECRET": ""}
    proc = subprocess.Popen(["node", "src/server.js", "--port", str(port)], env=env,
                            cwd=Path(__file__).resolve().parents[1])
    try:
        for _ in range(100):
            if proc.poll() is not None:
                raise RuntimeError("O servidor de teste encerrou antes de iniciar.")
            try:
                with urlopen(base + "/health", timeout=1) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError("O servidor de teste não iniciou.")
        yield base
    finally:
        proc.terminate()
        proc.wait(timeout=10)

with servidor_de_teste() as base, sync_playwright() as engine:
    browser=engine.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN') or None, headless=True)
    page=browser.new_page()
    errors=[]
    page.on('pageerror', lambda error: errors.append(str(error)))
    widths=[320,390,768,1024,1440]
    def check(name):
        for width in widths:
            page.set_viewport_size({'width':width,'height':800})
            dimensions=page.evaluate('''() => {
              const body=document.documentElement;
              const dialog=document.querySelector("dialog[open]");
              return [body.scrollWidth,body.clientWidth,dialog ? dialog.scrollWidth-dialog.clientWidth : 0]
            }''')
            assert dimensions[0]<=dimensions[1]+1 and dimensions[2]<=1,(name,width,dimensions)
        print(name, 'ok')
    page.goto(base)
    page.locator('#auth-form').wait_for()
    check('login')
    page.get_by_text('Esqueci minha senha').click()
    check('recuperação')
    page.locator('[data-mode=login]').click()
    page.locator('#toggle-auth').click()
    check('cadastro')
    page.locator('[name=nome]').fill('Pessoa de teste')
    page.locator('[name=empresa]').fill('Oficina '+('Exemplo de produção ')*4)
    page.locator('[name=telefone]').fill('11987654321')
    assert page.locator('[name=telefone]').input_value()=='(11) 98765-4321'
    addr='ui'+str(time.time_ns())+'@example.test'
    page.locator('[name=email]').fill(addr)
    page.locator('[name=senha]').fill('senha-exemplo-123')
    page.locator('[data-eye=senha]').click()
    assert page.locator('[name=senha]').get_attribute('type')=='text'
    page.locator('[name=confirmar]').fill('divergente')
    page.locator('[name=termos]').check()
    page.locator('#auth-form [type=submit]').click()
    assert 'iguais' in page.locator('#msg-confirmar').inner_text()
    page.locator('[name=confirmar]').fill('senha-exemplo-123')
    page.locator('#auth-form [type=submit]').click()
    page.locator('[data-nav]').first.wait_for()
    check('projetos')
    for view in ['materiais','retalhos','maquina','equipe','conta']:
        page.locator('[data-nav='+view+']').click()
        page.locator('[data-nav='+view+'].active').wait_for()
        check(view)
    def post(path,obj):
        r=page.request.post(base+path,data=obj)
        assert r.ok,(path,r.status,r.text())
        return r.json().get('dados')
    project=post('/api/projetos',{'nome':'Teste layout','cliente':'Oficina'})
    path='/api/projetos/'+project['id']
    for thickness in [12,18]:
        post(path+'/pecas',{'codigo':'P'+str(thickness),'descricao':'Porta do armário','material':'MDF','acabamento':'Marrom Claro','espessura':thickness,'largura':300,'comprimento':400,'quantidade':2,'giroPermitido':False})
    post(path+'/otimizar',{'tentativas':4})
    page.locator('[data-nav=projetos]').click()
    page.locator('[data-open]').first.click()
    page.locator('[data-plan]').first.wait_for()
    check('detalhe projeto')
    page.locator('[data-plan]').first.click()
    page.locator('#report-next').wait_for()
    check('editor e relatório')
    page.set_viewport_size({'width':320,'height':700})
    page.locator('#report-next').click()
    assert page.locator('#board-select').input_value()=='1'
    page.locator('[data-zoom-in]').click()
    assert '125' in page.locator('[data-zoom-label]').inner_text()
    page.locator('[data-zoom-expand]').click()
    check('editor ampliado')
    page.locator('[data-zoom-expand]').click()
    page.locator('[data-nav=equipe]').click()
    page.locator('#add-user').click()
    check('janela de cadastro')
    page.locator('#cancel-modal').click()
    page.locator('#logout').click()
    page.locator('#auth-form').wait_for()
    page.goto(base+'/exemplo-editor.html?projeto=promob')
    page.locator('#example-board').wait_for()
    check('demonstração')
    assert not errors,errors
    browser.close()

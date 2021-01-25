from lona.html import Div, H1, P, Strong


def handle_request(request):
    s = Strong()

    html = Div(
        H1('Redirect'),
        P('You will be HTTP redirected in ', s, ' seconds'),
    )

    for i in [3, 2, 1]:
        s.set_text(str(i))

        request.client.show(html)

        request.view.sleep(1)

    return {
        'http_redirect': '/',
    }

namespace Pano.Api.Endpoints;

// Hata cevapları ProblemDetails biçiminde; arayüz "detail" alanını gösterir.
public static class Http
{
    public static IResult Bad(string message) => Results.Problem(detail: message, statusCode: 400);
    public static IResult Conflict(string message) => Results.Problem(detail: message, statusCode: 409);
}

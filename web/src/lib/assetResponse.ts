export const makeAssetResponseMutable = (response: Response) =>
  new Response(response.body, response);

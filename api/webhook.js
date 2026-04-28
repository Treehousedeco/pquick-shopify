const fetch = require("node-fetch");

async function getPQuickToken() {
  const res = await fetch(
    "https://servicios.pquick-app.com/pquick/oauth/access_token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.PQUICK_CLIENT_ID,
        client_secret: process.env.PQUICK_CLIENT_SECRET,
        grant_type: "password",
        scope: "FullControl",
        username: process.env.PQUICK_USERNAME,
        password: process.env.PQUICK_PASSWORD,
      }),
    }
  );
  const data = await res.json();
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const order = req.body;
  if (!order || !order.id) return res.status(400).json({ error: "Pedido inválido" });

  try {
    const token = await getPQuickToken();

    const items = (order.line_items || []).map((item) => ({
      Id: String(item.variant_id || item.id),
      Nombre: item.title,
      Cantidad: item.quantity,
      Precio: parseFloat(item.price),
      Peso: (item.grams || 0) / 1000,
    }));

    const shipping = order.shipping_address || {};

    const body = {
      Despacho: {
        Orden: {
          Id: String(order.id),
          Comprador: {
            Nombre: order.customer?.first_name || "Sin nombre",
            Apellido: order.customer?.last_name || "",
            Telefono: order.customer?.phone || shipping.phone || "000",
            Mail: order.customer?.email || order.email || "",
          },
          DatosEntrega: {
            Destinatario: shipping.name || "",
            Direccion: {
              Pais: shipping.country_code || "UY",
              Departamento: shipping.province || "",
              Localidad: shipping.city || "",
              Calle: shipping.address1 || "",
              PuertaNro: shipping.address2 || "S/N",
              CodigoPostal: shipping.zip || "",
            },
          },
          Items: items,
        },
        CallBack_URL: "",
        ExtraInfo: {
          ServicioTipo: "Express",
          FechaEntrega: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
          CantidadBultos: 1,
          UsuarioEmpresaId: 1691,
          Integracion: process.env.PQUICK_INTEGRACION,
        },
      },
    };

    const pquickRes = await fetch(
      "https://servicios.pquick-app.com/pquick/IntegracionesAPI/createShipping",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const pquickData = await pquickRes.json();

    if (pquickData.Errores && pquickData.Errores.length > 0) {
      console.error("Errores PQuick:", pquickData.Errores);
      return res.status(500).json({ errores: pquickData.Errores });
    }

    console.log("Envío creado:", pquickData.DespachoRespuesta);
    return res.status(200).json({ ok: true, data: pquickData.DespachoRespuesta });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: err.message });
  }
}

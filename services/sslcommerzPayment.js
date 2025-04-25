const axios = require("axios");
require("dotenv").config();

const store_id = process.env.SSL_STORE_ID;
const store_passwd = process.env.SSL_STORE_PASSWD;
const is_live = false; // Set to true for production

const initiateSSLCommerzPayment = async (req, paymentsCollection) => {
    const { total_amount, cus_name, cus_email, cus_phone } = req.body;
    const tran_id = `TRX_${Date.now()}`;

    const paymentData = {
        store_id,
        store_passwd,
        total_amount,
        currency: "USD",
        tran_id,
        success_url: "https://gizmorent-7af7c.web.app/payment-success",
        fail_url: "https://gizmorent-7af7c.web.app/payment-fail",
        cancel_url: "https://gizmorent-7af7c.web.app/payment-cancel",
        cus_name,
        cus_email,
        cus_phone,
        shipping_method: "Courier",
        product_name: "Gadget Rent",
        product_category: "Rental",
        product_profile: "general",
        ship_name: cus_name,
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: "1000",
        ship_country: "Bangladesh",
    };

    try {
        const sslcommerzUrl = is_live
            ? "https://securepay.sslcommerz.com/gwprocess/v4/api.php"
            : "https://sandbox.sslcommerz.com/gwprocess/v3/api.php";

        // Convert data to application/x-www-form-urlencoded
        const response = await axios.post(
            sslcommerzUrl,
            new URLSearchParams(paymentData),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        if (response.data && response.data.GatewayPageURL) {
            await paymentsCollection.insertOne({
                email: cus_email,
                amount: total_amount,
                transactionId: tran_id,
                date: new Date(),
            });

            return { url: response.data.GatewayPageURL, tran_id };
        } else {
            throw new Error("Failed to get payment gateway URL");
        }
    } catch (error) {
        throw new Error("Could not process payment. Please try again later.");
    }
};

module.exports = initiateSSLCommerzPayment;
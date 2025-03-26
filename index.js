const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 3000;

const corsOptions = {
  origin: "http://localhost:5173",
  methods: "GET,POST,DELETE,PUT",
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.du8ko.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect(); // Keep the connection open
    console.log("Connected to MongoDB!");

    const gadgetCollection = client.db("gizmorentdb").collection("gadget");
    const wishlistedCollection = client.db("gizmorentdb").collection("wishlisted");

    // Add a gadget
    app.post("/gadgets", async (req, res) => {
      try {
        const newGadget = req.body;
        const result = await gadgetCollection.insertOne(newGadget);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to add gadget" });
      }
    });


    // Get all gadgets
    app.get("/gadgets", async (req, res) => {
      try {
        const result = await gadgetCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch gadgets" });
      }
    });

    // Adding gadgets to wishlist
    app.post('/wishlisted', async (req, res) => {
      const newWish = req.body
      const wish = await wishlistedCollection.insertOne(newWish)
      res.send(wish)
      console.log(wish)

    })
    app.get("/wishlisted", async (req, res) => {
      try {
        const result = await wishlistedCollection.find().toArray();
        res.send(result);
        console.log(result)
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch gadgets" });
      }
    });

    // delete from wishlist
    app.delete("/wishlisted/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
    
      try {
        const result = await wishlistedCollection.deleteOne(query);
        if (result.deletedCount > 0) {
          res.send({ success: true, message: "Item removed from your wishlist." });
        } else {
          res.status(404).send({ success: false, message: "Item not found in wishlist." });
        }
      } catch (error) {
        res.status(500).send({ success: false, message: "Server error." });
      }
    });
    

    // gadgets filter and search

    app.get("/gadgets/search", async (req, res) => {
      const { query, category, minPrice, maxPrice, sort } = req.query;

      const filter = {};

      // Filter by category
      if (category && category !== "All") {
        filter.category = category;
      }

      // Filter by search query
      if (query) {
        filter.$or = [
          { name: { $regex: query, $options: "i" } },
          { category: { $regex: query, $options: "i" } },
        ];
      }

      // price filter
      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = parseFloat(minPrice);
        if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
      }

      // sort
      let sortOption = {};
      if (sort === "HighToLow") {
        sortOption = { price: -1 };
      } else if (sort === "LowToHigh") {
        sortOption = { price: 1 };
      }

      try {
        const gadgets = await gadgetCollection
          .find(filter)
          .sort(sortOption)
          .toArray();
        res.send(gadgets);
      } catch (error) {
        res.status(500).json({ message: "Error fetching gadgets", error });
      }
    });

    // one gadget by id

    app.get('/gadgets/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await gadgetCollection.findOne(query);
      res.send(result);

    });

    // add from here


  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

run();

app.get("/", (req, res) => {
  res.send("Gizmorent is running");
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});

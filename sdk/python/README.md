# KBSI Protein Crystallization Bank SDK

Python client for the KBSI Protein Crystallization Bank API.

## Installation

```bash
pip install kbsi-protein
```

## Quick Start

```python
from kbsi_protein import KBSIClient

client = KBSIClient()

# Database statistics
stats = client.get_statistics()
print(stats)
# {'statistics': {'protein': 70023, 'construct': 286580, ...}}

# Search proteins
result = client.search_proteins("KRAS")
for p in result["data"]:
    print(f"{p['abbreviation']}: {p['full_name']}")

# Predict crystallization success
pred = client.predict(ph=7.0, temperature=18, precipitant_type="PEG 3350")
print(f"Success probability: {pred['prediction']['success_probability']}%")

# Recommend conditions
recs = client.recommend(ph=7.0, temperature=18, k=5)
for r in recs["recommendations"]:
    print(f"pH {r['ph']}, {r['temperature']}°C → {r['outcome']}")

# Sequence similarity search
results = client.sequence_search("MTEYKLVVVGAGGVGKSALTIQLIQN...")
for r in results["results"]:
    print(f"{r['protein_name']}: {r['similarity']}% similar")

# Export ML dataset
csv_data = client.export_ml_dataset(format="csv", binary=True)
with open("dataset.csv", "w") as f:
    f.write(csv_data)
```

## API Reference

| Method | Description |
|--------|-------------|
| `search_proteins(query)` | Search by name/abbreviation/gene |
| `get_constructs(protein_id)` | List constructs |
| `get_crystallizations(construct_id)` | List crystallization data |
| `recommend(ph, temperature, ...)` | k-NN condition recommendation |
| `predict(ph, temperature, ...)` | Success probability prediction |
| `sequence_search(sequence)` | Sequence similarity search |
| `export_ml_dataset(format, binary)` | ML training dataset |
| `get_statistics()` | Database statistics |

## Links

- Web: https://kbsi-crystal-bank.vercel.app
- API Docs: https://kbsi-crystal-bank.vercel.app/api-docs
- MCP: https://kbsi-crystal-bank.vercel.app/api/mcp

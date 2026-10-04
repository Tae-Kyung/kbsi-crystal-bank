"""
KBSI Protein Crystallization Bank API Client

Usage:
    from kbsi_protein import KBSIClient

    client = KBSIClient()  # or KBSIClient(base_url="...", api_key="...")

    # Search proteins
    proteins = client.search_proteins("KRAS")

    # Get statistics
    stats = client.get_statistics()

    # Predict crystallization success
    pred = client.predict(ph=7.0, temperature=18, precipitant_type="PEG 3350")

    # Recommend conditions
    recs = client.recommend(ph=7.0, temperature=18)

    # Search by sequence similarity
    results = client.sequence_search("MTEYKLVVVGAGGVGKS...")

    # Export ML dataset
    df = client.export_ml_dataset(format="csv", binary=True)
"""

import requests
from typing import Optional, Dict, Any, List


class KBSIClient:
    """Client for KBSI Protein Crystallization Bank API"""

    DEFAULT_URL = "https://kbsi-crystal-bank.vercel.app"

    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        self.base_url = (base_url or self.DEFAULT_URL).rstrip("/")
        self.session = requests.Session()
        if api_key:
            self.session.headers["Authorization"] = f"Bearer {api_key}"

    def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        resp = self.session.get(f"{self.base_url}{path}", params=params)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, json: Optional[Dict] = None) -> Any:
        resp = self.session.post(f"{self.base_url}{path}", json=json)
        resp.raise_for_status()
        return resp.json()

    # ─── Proteins ───
    def search_proteins(self, query: str, limit: int = 20, page: int = 1) -> Dict:
        """Search proteins by name, abbreviation, or gene name"""
        return self._get("/api/proteins", {"search": query, "limit": limit, "page": page})

    def get_protein(self, protein_id: int) -> Dict:
        """Get protein by ID"""
        return self._get(f"/api/proteins/{protein_id}")

    # ─── Constructs ───
    def get_constructs(self, protein_id: Optional[int] = None, limit: int = 20) -> Dict:
        """List constructs, optionally filtered by protein"""
        params: Dict = {"limit": limit}
        if protein_id:
            params["protein_id"] = protein_id
        return self._get("/api/constructs", params)

    # ─── Experiments ───
    def get_crystallizations(self, construct_id: Optional[int] = None, limit: int = 50) -> Dict:
        """List crystallization experiments"""
        params: Dict = {"limit": limit}
        if construct_id:
            params["construct_id"] = construct_id
        return self._get("/api/crystallizations", params)

    def get_expressions(self, construct_id: Optional[int] = None, limit: int = 50) -> Dict:
        """List expression experiments"""
        params: Dict = {"limit": limit}
        if construct_id:
            params["construct_id"] = construct_id
        return self._get("/api/expressions", params)

    # ─── AI/ML ───
    def recommend(self, ph: Optional[float] = None, temperature: Optional[float] = None,
                  precipitant_type: Optional[str] = None, k: int = 10, **kwargs) -> Dict:
        """Recommend crystallization conditions (k-NN)"""
        params: Dict = {"k": k}
        if ph is not None: params["ph"] = ph
        if temperature is not None: params["temperature"] = temperature
        if precipitant_type: params["precipitant_type"] = precipitant_type
        params.update(kwargs)
        return self._get("/api/recommend", params)

    def predict(self, ph: Optional[float] = None, temperature: Optional[float] = None,
                precipitant_type: Optional[str] = None, **kwargs) -> Dict:
        """Predict crystallization success probability"""
        body: Dict = {}
        if ph is not None: body["ph"] = ph
        if temperature is not None: body["temperature"] = temperature
        if precipitant_type: body["precipitant_type"] = precipitant_type
        body.update(kwargs)
        return self._post("/api/predict", body)

    def sequence_search(self, sequence: str, limit: int = 10) -> Dict:
        """Search proteins by sequence similarity (k-mer Jaccard)"""
        return self._get("/api/sequence-search", {"sequence": sequence, "limit": limit})

    # ─── Export ───
    def export_data(self, table: str, format: str = "json", construct_id: Optional[int] = None) -> Any:
        """Export table data as JSON or CSV"""
        params: Dict = {"table": table, "format": format}
        if construct_id:
            params["construct_id"] = construct_id
        if format == "csv":
            resp = self.session.get(f"{self.base_url}/api/export", params=params)
            resp.raise_for_status()
            return resp.text
        return self._get("/api/export", params)

    def export_ml_dataset(self, format: str = "json", binary: bool = False) -> Any:
        """Export ML training dataset"""
        params: Dict = {"format": format}
        if binary:
            params["binary"] = "true"
        if format == "csv":
            resp = self.session.get(f"{self.base_url}/api/export/ml-dataset", params=params)
            resp.raise_for_status()
            return resp.text
        return self._get("/api/export/ml-dataset", params)

    # ─── Statistics ───
    def get_statistics(self) -> Dict:
        """Get database statistics"""
        # Use MCP endpoint for stats
        resp = self.session.post(
            f"{self.base_url}/api/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                  "params": {"name": "get_statistics", "arguments": {}}},
            headers={"Accept": "application/json, text/event-stream",
                     "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        import json
        result = resp.json()
        return json.loads(result["result"]["content"][0]["text"])

    # ─── OpenAPI ───
    def get_openapi_spec(self) -> Dict:
        """Get OpenAPI 3.0 specification"""
        return self._get("/api/openapi")


const PSI_BASE_URL = "http://localhost:8000";

export interface SafestRouteResponse {
    best_route_index: number;
    safest_psi: number;
    heatmap_data: Array<{ lat: number; lng: number; psi: number }>;
}

export interface LocationPsiResponse {
    area: string;
    psi_score: number;
    nearest_distance: number;
}

/**
 * Service to interact with the Python PSI Engine backend.
 */
export const psiService = {
    /**
     * Get PSI prediction for a specific set of features.
     */
    async predictPsi(features: any): Promise<{ psi_score: number }> {
        const response = await fetch(`${PSI_BASE_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(features),
        });
        if (!response.ok) throw new Error("PSI Prediction API failed");
        return response.json();
    },

    /**
     * Get regional safety context for a specific coordinate.
     */
    async getLocationPsi(lat: number, lng: number): Promise<LocationPsiResponse> {
        const response = await fetch(`${PSI_BASE_URL}/location-psi`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng }),
        });
        if (!response.ok) throw new Error("Location PSI API failed");
        return response.json();
    },

    /**
     * Identify the safest route from a list of possibilities.
     * @param routes Nested array of coordinates [[[lat, lng], ...], ...]
     */
    async findSafestRoute(routes: number[][][]): Promise<SafestRouteResponse> {
        const response = await fetch(`${PSI_BASE_URL}/safest-route`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ routes }),
        });
        if (!response.ok) throw new Error("Safest Route API failed");
        return response.json();
    }
};

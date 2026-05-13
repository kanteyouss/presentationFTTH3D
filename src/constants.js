export const COLORS = {
    BACKGROUND: '#1a1a2e',
    GRID: '#2d3436',
    TRANSPORT: '#00d2ff',
    DISTRIBUTION: '#ff9f43',
    HUB: '#00cec9',
    CABINET: '#fab1a0',
    BOX: '#ff7675',
    ROAD: '#2d3436',
    BUILDING: '#bdc3c7',
    ELIGIBLE: '#2ed573',
    WAITING: '#ffa502',
    NON_ELIGIBLE: '#ff4757',
    TEXT_PRIMARY: '#ffffff',
    TEXT_SECONDARY: '#b2bec3',
    ACCENT: '#0984e3'
};

export const STAGES = [
    {
        id: 0,
        name: 'Analyse SIG',
        description: 'Étude de la densité de population et du potentiel économique du quartier.',
        camera: { radius: 100, alpha: -Math.PI / 4, beta: Math.PI / 3, target: { x: 0, y: 0, z: 0 } }
    },
    {
        id: 1,
        name: 'Décision Opérateur',
        description: 'Définition de l\'architecture cible suite aux analyses SIG.',
        camera: { radius: 80, alpha: -Math.PI / 2, beta: Math.PI / 4, target: { x: 0, y: 0, z: 0 } }
    },
    {
        id: 2,
        name: 'Étape 1: NRO',
        description: 'Implantation du Noeud de Raccordement Optique (Cœur du réseau).',
        camera: { radius: 25, alpha: -Math.PI / 1.5, beta: Math.PI / 3, target: { x: -68, y: 0, z: -58 } }
    },
    {
        id: 3,
        name: 'Étape 2: Transport',
        description: 'Déploiement des câbles de transport le long des axes principaux.',
        camera: { radius: 60, alpha: -Math.PI / 4, beta: Math.PI / 3, target: { x: -20, y: 0, z: -20 } }
    },
    {
        id: 4,
        name: 'Étape 3: SRO',
        description: 'Installation des Sous-Répartiteurs Optiques (Pulse de couverture).',
        camera: { radius: 40, alpha: -Math.PI / 3, beta: Math.PI / 4, target: { x: -10, y: 0, z: -10 } }
    },
    {
        id: 5,
        name: 'Étape 4: Distribution',
        description: 'Liaison locale entre les SRO et les quartiers.',
        camera: { radius: 50, alpha: -Math.PI / 2.5, beta: Math.PI / 3, target: { x: 30, y: 0, z: 30 } }
    },
    {
        id: 6,
        name: 'Étape 5: PBO',
        description: 'Points de Branchement Optique : Bilan d\'éligibilité final.',
        camera: { radius: 30, alpha: -Math.PI / 4, beta: Math.PI / 3, target: { x: 10, y: 3, z: 10 } }
    },
    {
        id: 7,
        name: 'Étape 6: Bâtiment Non-Éligible',
        description: 'Bâtiment trop éloigné d\'un PBO (absence de couverture capillaire).',
        camera: { radius: 25, alpha: -Math.PI / 4, beta: Math.PI / 3, target: { x: -35, y: 2, z: -35 } }
    }
];

export const NETWORK_CONFIG = {
    GROUND_SIZE: 200,
    TRANSPORT_RADIUS: 0.25,
    DISTRIBUTION_RADIUS: 0.12,
    DUCT_RADIUS: 0.42,
    DUCT_CAPACITY: 4,
    CHAMBER_CAPACITY: 6,
    BUNDLE_GROWTH: 0.14,
    NRO_POS: { x: -68, y: 0, z: -58 },
    SRO_POSITIONS: [
        { id: 'SRO-A', x: -10, z: -10, subscribers: 450, type: 'ZMD' },
        { id: 'SRO-B', x: 30, z: -40, subscribers: 280, type: 'ZMD' },
        { id: 'SRO-C', x: -30, z: 35, subscribers: 520, type: 'ZTD' },
        { id: 'SRO-D', x: 55, z: 45, subscribers: 350, type: 'ZMD' }
    ]
};

// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;
pragma experimental ABIEncoderV2;

contract HoneyChainCore {
    address public kvicAdmin;
    mapping(address => bool) public isKvicAdmin;

    constructor() public {
        kvicAdmin = 0x556FCE98dC5b75C5097eEf0581BC17f771944EbB;
        isKvicAdmin[0x556FCE98dC5b75C5097eEf0581BC17f771944EbB] = true;
        isKvicAdmin[msg.sender] = true;
    }

    modifier onlyAdmin() {
        require(msg.sender == kvicAdmin || isKvicAdmin[msg.sender], "Only KVIC Admin authorized");
        _;
    }

    function checkIsAdmin(address _entity) public view returns (bool) {
        return _entity == kvicAdmin || isKvicAdmin[_entity];
    }

    function addAdmin(address _admin) external onlyAdmin {
        isKvicAdmin[_admin] = true;
    }

    enum Stage {
        Harvested,       // Beekeeper extracted raw comb honey from Smart Hive
        QualityTested,   // KVIC / FSSAI accredited lab verified purity & adulteration
        Processed,       // Moisture reduction (<20%) & micro-filtration done
        Distributed,     // In transit with temperature-controlled logistics
        Retail,          // On KVIC Emporium / Retail shelves
        Sold             // Purchased by verified consumer
    }

    enum FloraType {
        Mustard,
        Acacia,
        Eucalyptus,
        Sidr,
        Multifloral,
        
        ForestWild
    }

    struct Beekeeper {
        address wallet;
        uint256 id;
        string name;
        string clusterLocation;
        string state;
        string kvicRegNumber;
        uint256 totalBoxes;
        bool isVerified;
    }

    struct SmartHive {
        uint256 hiveId;
        uint256 beekeeperId;
        string boxIdentifier;
        FloraType flora;
        uint256 installTimestamp;
        uint256 healthScore;  // 0 - 100 calculated by Edge AI
        bool activeAlert;     // Swarm or Varroa warning active
    }

    struct LabReport {
        uint256 testTimestamp;
        uint256 moisturePercentX100;   // e.g. 1850 = 18.50% (Standard is <=20.00%)
        uint256 c4SugarPercentX100;    // e.g. 0 = 0% (Adulteration test: must be <= 7.00%)
        uint256 pollenPurityScore;     // 0 - 100 score
        bool antibioticFree;
        string labCertHash;
        address testedBy;
        bool passed;
    }

    struct HoneyBatch {
        uint256 batchId;
        uint256 hiveId;
        uint256 beekeeperId;
        string batchCode;
        FloraType flora;
        uint256 harvestTimestamp;
        uint256 yieldWeightKg;
        uint256 jarsTotal;
        uint256 jarsSold;
        string iotTelemetryHash;
        Stage stage;
        bool isCertifiedPure;
        bool isFlagged;
        string flagReason;
        address assignedDistributor;
        address assignedRetailer;
        string targetDestination;
    }

    struct BottleSale {
        uint256 bottleNumber;
        string customerName;
        string customerPhone;
        string invoiceNumber;
        uint256 saleTimestamp;
        address soldByRetailer;
    }

    struct SupplyEvent {
        uint256 timestamp;
        Stage stage;
        address actor;
        string location;
        string notes;
    }

    // Counters
    uint256 public beekeeperCount = 0;
    uint256 public hiveCount = 0;
    uint256 public batchCount = 0;

    // Mappings
    mapping(uint256 => Beekeeper) public beekeepers;
    mapping(address => uint256) public beekeeperIdByWallet;

    mapping(uint256 => SmartHive) public smartHives;
    mapping(uint256 => HoneyBatch) private honeyBatches;
    mapping(uint256 => LabReport) public batchLabReports;
    mapping(uint256 => SupplyEvent[]) public batchHistory;
    mapping(uint256 => mapping(uint256 => BottleSale)) public bottleSales;
    mapping(uint256 => uint256[]) private soldBottleNumbers;

    // Authorized Role Mappings
    mapping(address => bool) public authorizedLabs;
    mapping(address => bool) public authorizedProcessors;
    mapping(address => bool) public authorizedDistributors;
    mapping(address => bool) public authorizedRetailers;

    // Duplicate Prevention Mappings
    mapping(bytes32 => bool) public registeredBoxHashes;
    mapping(bytes32 => bool) public registeredBatchCodeHashes;

    // Events
    event BeekeeperRegistered(uint256 indexed beekeeperId, string name, string clusterLocation);
    event HiveRegistered(uint256 indexed hiveId, uint256 indexed beekeeperId, string boxIdentifier);
    event HiveTelemetryLogged(uint256 indexed hiveId, uint256 healthScore, bool alertActive);
    event BatchHarvested(uint256 indexed batchId, string batchCode, uint256 yieldKg, address beekeeper);
    event QualityTestCompleted(uint256 indexed batchId, bool passed, uint256 moisture, uint256 c4Sugar);
    event BatchStageUpdated(uint256 indexed batchId, Stage stage, address actor, string location);
    event AdulterationFlagged(uint256 indexed batchId, string reason);
    event BottleSold(uint256 indexed batchId, uint256 indexed bottleNumber, string customerName, string invoiceNumber);
    event RoleUpdated(address indexed entity, string role, bool active);

    // Roles and participant registration

    function hasAnyRole(address _entity) public view returns (bool) {
        return authorizedLabs[_entity] || authorizedProcessors[_entity] || authorizedDistributors[_entity] || authorizedRetailers[_entity];
    }

    function registerBeekeeper(
        address _wallet,
        string memory _name,
        string memory _clusterLocation,
        string memory _state,
        string memory _kvicRegNumber
    ) public returns (uint256) {
        require(msg.sender == kvicAdmin || isKvicAdmin[msg.sender] || msg.sender == _wallet, "Unauthorized caller");
        require(_wallet != address(0), "Invalid wallet");
        require(beekeeperIdByWallet[_wallet] == 0, "Beekeeper already registered");

        beekeeperCount++;
        beekeepers[beekeeperCount] = Beekeeper({
            wallet: _wallet,
            id: beekeeperCount,
            name: _name,
            clusterLocation: _clusterLocation,
            state: _state,
            kvicRegNumber: _kvicRegNumber,
            totalBoxes: 0,
            isVerified: true
        });
        beekeeperIdByWallet[_wallet] = beekeeperCount;

        emit BeekeeperRegistered(beekeeperCount, _name, _clusterLocation);
        return beekeeperCount;
    }

    function registerSmartHive(
        uint256 _beekeeperId,
        string memory _boxIdentifier,
        FloraType _flora
    ) public returns (uint256) {
        require(_beekeeperId > 0 && _beekeeperId <= beekeeperCount, "Invalid beekeeper ID");
        require(msg.sender == kvicAdmin || isKvicAdmin[msg.sender] || msg.sender == beekeepers[_beekeeperId].wallet, "Unauthorized");
        require(bytes(_boxIdentifier).length > 0, "Box ID empty");

        bytes32 boxHash = keccak256(bytes(_boxIdentifier));
        require(!registeredBoxHashes[boxHash], "Hive box already registered");
        registeredBoxHashes[boxHash] = true;

        hiveCount++;
        smartHives[hiveCount] = SmartHive({
            hiveId: hiveCount,
            beekeeperId: _beekeeperId,
            boxIdentifier: _boxIdentifier,
            flora: _flora,
            installTimestamp: block.timestamp,
            healthScore: 95,
            activeAlert: false
        });

        beekeepers[_beekeeperId].totalBoxes++;

        emit HiveRegistered(hiveCount, _beekeeperId, _boxIdentifier);
        return hiveCount;
    }

    function setEntityRole(address _entity, string memory _role, bool _active) public onlyAdmin {
        require(_entity != address(0), "Invalid address");
        bytes32 roleHash = keccak256(bytes(_role));

        if (_active) {
            if (roleHash == keccak256(bytes("LAB"))) {
                authorizedLabs[_entity] = true;
            } else if (roleHash == keccak256(bytes("PROCESSOR"))) {
                authorizedProcessors[_entity] = true;
            } else if (roleHash == keccak256(bytes("DISTRIBUTOR"))) {
                authorizedDistributors[_entity] = true;
            } else if (roleHash == keccak256(bytes("RETAILER"))) {
                authorizedRetailers[_entity] = true;
            } else {
                revert("Unknown role");
            }
        } else {
            if (roleHash == keccak256(bytes("LAB"))) {
                require(authorizedLabs[_entity], "LAB role not active");
                authorizedLabs[_entity] = false;
            } else if (roleHash == keccak256(bytes("PROCESSOR"))) {
                require(authorizedProcessors[_entity], "PROCESSOR role not active");
                authorizedProcessors[_entity] = false;
            } else if (roleHash == keccak256(bytes("DISTRIBUTOR"))) {
                require(authorizedDistributors[_entity], "DISTRIBUTOR role not active");
                authorizedDistributors[_entity] = false;
            } else if (roleHash == keccak256(bytes("RETAILER"))) {
                require(authorizedRetailers[_entity], "RETAILER role not active");
                authorizedRetailers[_entity] = false;
            } else {
                revert("Unknown role");
            }
        }
        emit RoleUpdated(_entity, _role, _active);
    }

    function checkEntityRole(address _entity, string memory _role) public view returns (bool) {
        bytes32 roleHash = keccak256(bytes(_role));
        if (roleHash == keccak256(bytes("LAB"))) return authorizedLabs[_entity];
        if (roleHash == keccak256(bytes("PROCESSOR"))) return authorizedProcessors[_entity];
        if (roleHash == keccak256(bytes("DISTRIBUTOR"))) return authorizedDistributors[_entity];
        if (roleHash == keccak256(bytes("RETAILER"))) return authorizedRetailers[_entity];
        return false;
    }

    // Hive telemetry updates

    function updateHiveTelemetry(
        uint256 _hiveId,
        uint256 _healthScore,
        bool _alertActive
    ) public {
        require(_hiveId > 0 && _hiveId <= hiveCount, "Invalid hive ID");
        uint256 bkpId = smartHives[_hiveId].beekeeperId;
        require(msg.sender == kvicAdmin || isKvicAdmin[msg.sender] || msg.sender == beekeepers[bkpId].wallet, "Unauthorized");

        smartHives[_hiveId].healthScore = _healthScore;
        smartHives[_hiveId].activeAlert = _alertActive;

        emit HiveTelemetryLogged(_hiveId, _healthScore, _alertActive);
    }

    // Harvest and batch lifecycle operations

    function harvestBatch(
        uint256 _hiveId,
        string memory _batchCode,
        uint256 _yieldWeightKg,
        string memory _iotTelemetryHash
    ) public returns (uint256) {
        require(_hiveId > 0 && _hiveId <= hiveCount, "Invalid hive ID");
        uint256 bkpId = smartHives[_hiveId].beekeeperId;
        require(msg.sender == beekeepers[bkpId].wallet || msg.sender == kvicAdmin || isKvicAdmin[msg.sender], "Caller is not assigned beekeeper");
        require(_yieldWeightKg > 0, "Yield weight must be > 0");
        require(bytes(_batchCode).length > 0, "Batch code cannot be empty");

        bytes32 batchHash = keccak256(bytes(_batchCode));
        require(!registeredBatchCodeHashes[batchHash], "Batch code already registered on blockchain");
        registeredBatchCodeHashes[batchHash] = true;

        batchCount++;
        FloraType flora = smartHives[_hiveId].flora;

        HoneyBatch storage b = honeyBatches[batchCount];
        b.batchId = batchCount;
        b.hiveId = _hiveId;
        b.beekeeperId = bkpId;
        b.batchCode = _batchCode;
        b.flora = flora;
        b.harvestTimestamp = block.timestamp;
        b.yieldWeightKg = _yieldWeightKg;
        b.jarsTotal = _yieldWeightKg * 2;
        b.jarsSold = 0;
        b.iotTelemetryHash = _iotTelemetryHash;
        b.stage = Stage.Harvested;
        b.isCertifiedPure = false;
        b.isFlagged = false;
        b.flagReason = "";
        b.assignedDistributor = address(0);
        b.assignedRetailer = address(0);
        b.targetDestination = "";

        recordHistory(batchCount, Stage.Harvested, msg.sender, beekeepers[bkpId].clusterLocation, "Raw honey harvested from smart hive");
        emit BatchHarvested(batchCount, _batchCode, _yieldWeightKg, msg.sender);
        return batchCount;
    }

    function certifyLabPurity(
        uint256 _batchId,
        uint256 _moisturePercentX100,
        uint256 _c4SugarPercentX100,
        uint256 _pollenPurityScore,
        bool _antibioticFree,
        string memory _labCertHash
    ) public {
        require(_batchId > 0 && _batchId <= batchCount, "Invalid batch ID");
        require(authorizedLabs[msg.sender] || msg.sender == kvicAdmin || isKvicAdmin[msg.sender], "Only authorized lab or admin");

        HoneyBatch storage batch = honeyBatches[_batchId];
        require(batch.stage == Stage.Harvested, "Batch must be in Harvested stage");

        // FSSAI / KVIC Honey Standards:
        // Moisture <= 20.00% (2000 in x100), C4 Sugar <= 7.00% (700 in x100), Antibiotic Free
        bool passed = (_moisturePercentX100 <= 2000) && (_c4SugarPercentX100 <= 700) && _antibioticFree;

        batchLabReports[_batchId] = LabReport({
            testTimestamp: block.timestamp,
            moisturePercentX100: _moisturePercentX100,
            c4SugarPercentX100: _c4SugarPercentX100,
            pollenPurityScore: _pollenPurityScore,
            antibioticFree: _antibioticFree,
            labCertHash: _labCertHash,
            testedBy: msg.sender,
            passed: passed
        });

        if (passed) {
            batch.stage = Stage.QualityTested;
            batch.isCertifiedPure = true;
            recordHistory(_batchId, Stage.QualityTested, msg.sender, "KVIC Quality Testing Center", "Lab test passed. Certified 100% Pure Honey.");
        } else {
            batch.isFlagged = true;
            batch.flagReason = "Failed KVIC purity test: High moisture or C4 sugar adulteration detected";
            emit AdulterationFlagged(_batchId, batch.flagReason);
            recordHistory(_batchId, Stage.Harvested, msg.sender, "KVIC Quality Testing Center", batch.flagReason);
        }

        emit QualityTestCompleted(_batchId, passed, _moisturePercentX100, _c4SugarPercentX100);
    }

    function processBatch(
        uint256 _batchId,
        string memory _facilityLocation,
        address _assignedDistributor,
        address _assignedRetailer,
        string memory _targetDestination
    ) public {
        require(_batchId > 0 && _batchId <= batchCount, "Invalid batch ID");
        require(authorizedProcessors[msg.sender] || msg.sender == kvicAdmin || isKvicAdmin[msg.sender], "Unauthorized processor");
        HoneyBatch storage batch = honeyBatches[_batchId];
        require(!batch.isFlagged, "Batch flagged for adulteration");
        require(batch.stage == Stage.QualityTested, "Must be quality tested first");

        batch.assignedDistributor = _assignedDistributor;
        batch.assignedRetailer = _assignedRetailer;
        batch.targetDestination = _targetDestination;
        batch.stage = Stage.Processed;
        batch.jarsTotal = batch.yieldWeightKg * 2;

        recordHistory(_batchId, Stage.Processed, msg.sender, _facilityLocation, "Moisture reduced and sealed in KVIC hygienic packaging");
        emit BatchStageUpdated(_batchId, Stage.Processed, msg.sender, _facilityLocation);
    }

    function dispatchBatch(uint256 _batchId, string memory _transitRoute) public {
        require(_batchId > 0 && _batchId <= batchCount, "Invalid batch ID");
        require(authorizedDistributors[msg.sender] || msg.sender == kvicAdmin || isKvicAdmin[msg.sender], "Unauthorized distributor");
        HoneyBatch storage batch = honeyBatches[_batchId];
        require(!batch.isFlagged, "Batch flagged");
        require(batch.stage == Stage.Processed, "Must be processed first");
        if (batch.assignedDistributor != address(0)) {
            require(msg.sender == batch.assignedDistributor || msg.sender == kvicAdmin || isKvicAdmin[msg.sender], "Unauthorized: You are not the assigned distributor for this batch");
        }

        batch.stage = Stage.Distributed;
        recordHistory(_batchId, Stage.Distributed, msg.sender, _transitRoute, "Dispatched via temperature-controlled supply chain");
        emit BatchStageUpdated(_batchId, Stage.Distributed, msg.sender, _transitRoute);
    }

    function stockAtRetail(uint256 _batchId, string memory _storeLocation) public {
        require(_batchId > 0 && _batchId <= batchCount, "Invalid batch ID");
        require(authorizedRetailers[msg.sender] || msg.sender == kvicAdmin || isKvicAdmin[msg.sender], "Unauthorized retailer");
        HoneyBatch storage batch = honeyBatches[_batchId];
        require(!batch.isFlagged, "Batch flagged");
        require(batch.stage == Stage.Distributed, "Must be distributed first");
        if (batch.assignedRetailer != address(0)) {
            require(msg.sender == batch.assignedRetailer || msg.sender == kvicAdmin || isKvicAdmin[msg.sender], "Unauthorized: You are not the assigned retailer for this batch");
        }

        batch.stage = Stage.Retail;
        recordHistory(_batchId, Stage.Retail, msg.sender, _storeLocation, "Available on store shelf with tamper-evident seal");
        emit BatchStageUpdated(_batchId, Stage.Retail, msg.sender, _storeLocation);
    }

    function getBatchCustody(uint256 _batchId) public view returns (
        address assignedDistributor,
        address assignedRetailer,
        string memory targetDestination
    ) {
        require(_batchId > 0 && _batchId <= batchCount, "Invalid batch ID");
        HoneyBatch storage b = honeyBatches[_batchId];
        return (b.assignedDistributor, b.assignedRetailer, b.targetDestination);
    }

    function markConsumerSold(uint256 _batchId, uint256 _jarsToSell) public {
        require(_batchId > 0 && _batchId <= batchCount, "Invalid batch ID");
        require(authorizedRetailers[msg.sender] || msg.sender == kvicAdmin || isKvicAdmin[msg.sender], "Unauthorized retailer");
        HoneyBatch storage batch = honeyBatches[_batchId];
        require(batch.stage == Stage.Retail, "Must be in Retail stage to sell");
        require(_jarsToSell > 0, "Must sell at least 1 jar");
        require(batch.jarsSold + _jarsToSell <= batch.jarsTotal, "Not enough jars in stock");

        batch.jarsSold += _jarsToSell;
        
        recordHistory(_batchId, Stage.Retail, msg.sender, "Consumer Checkout", "Sold jar(s) to consumer.");

        if (batch.jarsSold >= batch.jarsTotal) {
            batch.stage = Stage.Sold;
            recordHistory(_batchId, Stage.Sold, msg.sender, "Consumer Checkout", "Batch completely sold out.");
            emit BatchStageUpdated(_batchId, Stage.Sold, msg.sender, "Consumer Checkout");
        }
    }

    function sellBottle(
        uint256 _batchId,
        uint256 _bottleNumber,
        string memory _customerName,
        string memory _customerPhone,
        string memory _invoiceNumber
    ) public {
        require(_batchId > 0 && _batchId <= batchCount, "Invalid batch ID");
        require(authorizedRetailers[msg.sender] || msg.sender == kvicAdmin || isKvicAdmin[msg.sender], "Unauthorized retailer");
        HoneyBatch storage batch = honeyBatches[_batchId];
        require(batch.stage == Stage.Retail, "Must be in Retail stage to sell");
        if (batch.assignedRetailer != address(0)) {
            require(msg.sender == batch.assignedRetailer || msg.sender == kvicAdmin || isKvicAdmin[msg.sender], "Unauthorized: You are not assigned retailer");
        }
        require(_bottleNumber >= 1 && _bottleNumber <= batch.jarsTotal, "Invalid bottle number");
        require(bottleSales[_batchId][_bottleNumber].bottleNumber == 0, "Bottle already sold! Duplicate sale rejected.");

        bottleSales[_batchId][_bottleNumber] = BottleSale({
            bottleNumber: _bottleNumber,
            customerName: _customerName,
            customerPhone: _customerPhone,
            invoiceNumber: _invoiceNumber,
            saleTimestamp: block.timestamp,
            soldByRetailer: msg.sender
        });

        soldBottleNumbers[_batchId].push(_bottleNumber);
        batch.jarsSold += 1;

        recordHistory(
            _batchId,
            Stage.Retail,
            msg.sender,
            "Retail POS Checkout",
            string(abi.encodePacked("Sold Bottle #", uint2str(_bottleNumber), " to ", _customerName, " (Inv: ", _invoiceNumber, ")"))
        );

        emit BottleSold(_batchId, _bottleNumber, _customerName, _invoiceNumber);

        if (batch.jarsSold >= batch.jarsTotal) {
            batch.stage = Stage.Sold;
            recordHistory(_batchId, Stage.Sold, msg.sender, "Retail POS Checkout", "Batch completely sold out.");
            emit BatchStageUpdated(_batchId, Stage.Sold, msg.sender, "Retail POS Checkout");
        }
    }

    function getBottleSale(uint256 _batchId, uint256 _bottleNumber) public view returns (
        uint256 bottleNumber,
        string memory customerName,
        string memory customerPhone,
        string memory invoiceNumber,
        uint256 saleTimestamp,
        address soldByRetailer,
        bool isSold
    ) {
        require(_batchId > 0 && _batchId <= batchCount, "Invalid batch ID");
        BottleSale memory s = bottleSales[_batchId][_bottleNumber];
        bool sold = (s.bottleNumber != 0);
        return (
            s.bottleNumber,
            s.customerName,
            s.customerPhone,
            s.invoiceNumber,
            s.saleTimestamp,
            s.soldByRetailer,
            sold
        );
    }

    function getSoldBottles(uint256 _batchId) public view returns (uint256[] memory) {
        require(_batchId > 0 && _batchId <= batchCount, "Invalid batch ID");
        return soldBottleNumbers[_batchId];
    }

    // Verification getters

    function getBatchBasic(uint256 _batchId) public view returns (
        uint256 batchId,
        string memory batchCode,
        string memory beekeeperName,
        string memory clusterLocation,
        string memory floraName,
        uint256 harvestTimestamp
    ) {
        require(_batchId > 0 && _batchId <= batchCount, "Batch not found");
        HoneyBatch storage b = honeyBatches[_batchId];
        Beekeeper storage bk = beekeepers[b.beekeeperId];

        return (
            b.batchId,
            b.batchCode,
            bk.name,
            bk.clusterLocation,
            getFloraString(b.flora),
            b.harvestTimestamp
        );
    }

    function getBatchStatus(uint256 _batchId) public view returns (
        uint256 yieldWeightKg,
        uint256 jarsTotal,
        uint256 jarsSold,
        string memory currentStage,
        bool isCertifiedPure,
        bool isFlagged,
        string memory flagReason,
        string memory iotTelemetryHash
    ) {
        require(_batchId > 0 && _batchId <= batchCount, "Batch not found");
        HoneyBatch storage b = honeyBatches[_batchId];

        return (
            b.yieldWeightKg,
            b.jarsTotal,
            b.jarsSold,
            getStageString(b.stage),
            b.isCertifiedPure,
            b.isFlagged,
            b.flagReason,
            b.iotTelemetryHash
        );
    }

    function getBatchLabReport(uint256 _batchId) public view returns (
        uint256 testTimestamp,
        uint256 moisturePercentX100,
        uint256 c4SugarPercentX100,
        uint256 pollenPurityScore,
        bool antibioticFree,
        string memory labCertHash,
        bool passed
    ) {
        require(_batchId > 0 && _batchId <= batchCount, "Batch not found");
        LabReport memory r = batchLabReports[_batchId];
        return (
            r.testTimestamp,
            r.moisturePercentX100,
            r.c4SugarPercentX100,
            r.pollenPurityScore,
            r.antibioticFree,
            r.labCertHash,
            r.passed
        );
    }

    function getBatchHistory(uint256 _batchId) public view returns (SupplyEvent[] memory) {
        require(_batchId > 0 && _batchId <= batchCount, "Invalid batch ID");
        return batchHistory[_batchId];
    }

    function getFloraString(FloraType _flora) public pure returns (string memory) {
        if (_flora == FloraType.Mustard) return "Mustard Flower Honey";
        if (_flora == FloraType.Acacia) return "Kashmir Acacia Honey";
        if (_flora == FloraType.Eucalyptus) return "Eucalyptus Honey";
        if (_flora == FloraType.Sidr) return "Wild Sidr (Berry) Honey";
        if (_flora == FloraType.Multifloral) return "Himalayan Multifloral Honey";
        return "Sundarbans Wild Mangrove Honey";
    }

    function getStageString(Stage _stage) public pure returns (string memory) {
        if (_stage == Stage.Harvested) return "Harvested from Smart Hive";
        if (_stage == Stage.QualityTested) return "KVIC Lab Quality Certified";
        if (_stage == Stage.Processed) return "Processed & Sealed";
        if (_stage == Stage.Distributed) return "In Transit Distribution";
        if (_stage == Stage.Retail) return "Available at KVIC Retail";
        return "Delivered to Verified Consumer";
    }

    function recordHistory(
        uint256 _batchId,
        Stage _stage,
        address _actor,
        string memory _location,
        string memory _notes
    ) private {
        batchHistory[_batchId].push(SupplyEvent({
            timestamp: block.timestamp,
            stage: _stage,
            actor: _actor,
            location: _location,
            notes: _notes
        }));
    }

    function uint2str(uint256 _i) internal pure returns (string memory _uintAsString) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len - 1;
        while (_i != 0) {
            bstr[k--] = byte(uint8(48 + _i % 10));
            _i /= 10;
        }
        return string(bstr);
    }
}

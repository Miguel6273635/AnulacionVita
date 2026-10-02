sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment"
], function (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    MessageBox,
    MessageToast,
    Fragment
) {
    "use strict";

    return Controller.extend("z.anulacion.anulacion.controller.Main", {

        onInit: function () {
            var oVM = new JSONModel(this._getInitialState());
            oVM.setSizeLimit(1000);
            this.getView().setModel(oVM, "viewModel");

            this._logInfo("onInit", "Controlador inicializado correctamente");
            this._logAmbiente();
        },

        onExit: function () {
            if (this._oProviderDialog) {
                this._oProviderDialog.destroy();
                this._oProviderDialog = null;
            }

            if (this._oStatusMessageDialog) {
                this._oStatusMessageDialog.destroy();
                this._oStatusMessageDialog = null;
                this._pStatusMessageDialog = null;
            }

            if (this._oCancellationConfirmationDialog) {
                this._oCancellationConfirmationDialog.destroy();
                this._oCancellationConfirmationDialog = null;
                this._pCancellationConfirmationDialog = null;
            }

            this._oPendingCancellation = null;
        },

        getModel: function () {
            return this.getOwnerComponent().getModel();
        },

        getVM: function () {
            return this.getView().getModel("viewModel");
        },

        _generateTraceId: function (sPrefix) {
            return (sPrefix || "TRACE") +
                "_" +
                Date.now() +
                "_" +
                Math.floor(Math.random() * 100000);
        },

        _logInfo: function (sStep, sMessage, oData) {
            console.log("[INFO][" + sStep + "] " + sMessage, oData || "");
        },

        _logWarn: function (sStep, sMessage, oData) {
            console.warn("[WARN][" + sStep + "] " + sMessage, oData || "");
        },

        _logError: function (sStep, sMessage, oData) {
            console.error("[ERROR][" + sStep + "] " + sMessage, oData || "");
        },

        _serializeError: function (oError) {
            var oOut = {
                message: "",
                statusCode: "",
                statusText: "",
                responseText: "",
                responseJSON: null
            };

            try {
                oOut.message = oError && oError.message ? oError.message : "";
                oOut.statusCode = oError && oError.statusCode ? oError.statusCode : "";
                oOut.statusText = oError && oError.statusText ? oError.statusText : "";
                oOut.responseText = oError && oError.responseText ? oError.responseText : "";

                if (oOut.responseText) {
                    oOut.responseJSON = JSON.parse(oOut.responseText);
                }
            } catch (e) {
                oOut.responseJSON = null;
            }

            return oOut;
        },

        _logAmbiente: function () {
            var oModel = this.getModel();
            var sServiceUrl = "";

            try {
                sServiceUrl = oModel && oModel.sServiceUrl
                    ? oModel.sServiceUrl
                    : "";
            } catch (e) {
                sServiceUrl = "";
            }

            this._logInfo("_logAmbiente", "Información del servicio", {
                serviceUrl: sServiceUrl,
                currentUrl: window.location.href,
                host: window.location.host,
                origin: window.location.origin
            });
        },

        onMatDocLiveChange: function (oEvent) {
            var sOriginal = oEvent.getParameter("value") || "";
            var sSoloNumeros = sOriginal.replace(/\D/g, "");

            this.getVM().setProperty("/matDoc", sSoloNumeros);

            if (!sSoloNumeros) {
                this.getVM().setProperty("/canCancel", false);
            }
        },

        onLimpiar: function () {
            this.getVM().setData(this._getInitialState());
            MessageToast.show("La información fue limpiada.");
        },

        onBuscarDocumento: function () {
            var sMatDoc = this.getVM().getProperty("/matDoc");

            if (!sMatDoc) {
                MessageBox.warning("Ingresa un número de documento material.");
                return;
            }

            if (sMatDoc.length < 6) {
                MessageBox.warning(
                    "El documento material capturado parece incompleto."
                );
                return;
            }

            this._getPreview(sMatDoc);
        },

        _resetResultadoConsulta: function () {
            var oVM = this.getVM();

            oVM.setProperty("/preview", []);
            oVM.setProperty("/previewDisplay", []);
            oVM.setProperty("/previewHeader", {});
            oVM.setProperty("/previewItems", []);
            oVM.setProperty("/expandedPreviewGroups", {});
            oVM.setProperty("/detalle", []);
            oVM.setProperty("/canCancel", false);
            oVM.setProperty("/lastRunId", "");

            oVM.setProperty("/resultado", {
                Status: "",
                Message: ""
            });

            oVM.setProperty("/resultadoState", "None");
            oVM.setProperty(
                "/cancellationSummary",
                this._getEmptyCancellationSummary()
            );

            oVM.setProperty("/summary", {
                total: 0,
                hu: 0,
                material: 0,
                otros: 0,
                huPendientes: 0,
                huSelectionPending: 0
            });
        },

        _getPreview: function (sMatDoc) {
            var oModel = this.getModel();
            var oVM = this.getVM();
            var sTraceId = this._generateTraceId("PREVIEW");
            var sPath = "/AnulacionPreviewHeaderSet";

            oVM.setProperty("/busy", true);
            this._resetResultadoConsulta();

            this._logInfo("_getPreview", "Inicia consulta de vista previa", {
                traceId: sTraceId,
                matDoc: sMatDoc,
                path: sPath
            });

            oModel.read(sPath, {
                filters: [
                    new Filter(
                        "MatDoc",
                        FilterOperator.EQ,
                        sMatDoc
                    )
                ],

                urlParameters: {
                    "sap-client": "300",
                    "$expand": "ToItems"
                },

                success: function (oData) {
                    var oHeader = this._getDeepPreviewHeader(oData);
                    var aItems = this._getDeepPreviewItems(oHeader);

                    this._logInfo("_getPreview.success", "Respuesta recibida", {
                        traceId: sTraceId,
                        header: oHeader,
                        totalItems: aItems.length,
                        items: aItems
                    });

                    if (!oHeader) {
                        oVM.setProperty("/resultado", {
                            Status: "E",
                            Message: "No se encontraron registros para el documento."
                        });

                        oVM.setProperty("/resultadoState", "Error");
                        oVM.setProperty("/busy", false);
                        oVM.setProperty("/canCancel", false);

                        this._showStatusMessageDialog(
                            "No se encontraron registros para el documento material capturado.",
                            "No se encontraron resultados"
                        );
                        return;
                    }

                    if (String(oHeader.Status || "").toUpperCase() === "E") {
                        var sSapMessage = oHeader.Message ||
                            "SAP rechazó la consulta de vista previa.";

                        oVM.setProperty("/resultado", {
                            Status: "E",
                            Message: sSapMessage
                        });
                        oVM.setProperty("/resultadoState", "Error");
                        oVM.setProperty("/busy", false);
                        oVM.setProperty("/canCancel", false);
                        this._showStatusMessageDialog(
                            sSapMessage,
                            "No es posible continuar"
                        );
                        return;
                    }

                    if (!aItems.length) {
                        var sEmptyMessage = oHeader.Message ||
                            "No se encontraron registros para el documento material capturado.";

                        oVM.setProperty("/resultado", {
                            Status: "E",
                            Message: sEmptyMessage
                        });
                        oVM.setProperty("/resultadoState", "Error");
                        oVM.setProperty("/busy", false);
                        oVM.setProperty("/canCancel", false);
                        this._showStatusMessageDialog(
                            sEmptyMessage,
                            "No se encontraron resultados"
                        );
                        return;
                    }

                    var aPreviewItems = this._mapDeepPreviewItems(
                        oHeader,
                        aItems
                    );
                    var aGroupedRows = this._buildPreviewRows(aPreviewItems);

                    oVM.setProperty("/previewHeader", oHeader);
                    oVM.setProperty("/previewItems", aItems);
                    oVM.setProperty("/preview", aGroupedRows);
                    this._refreshPreviewDisplay();
                    this._updateSummary(aGroupedRows);
                    this._evaluatePreviewBeforeCancel(aGroupedRows);
                    oVM.setProperty("/busy", false);

                    MessageToast.show(
                        "Vista previa cargada correctamente."
                    );
                }.bind(this),

                error: function (oError) {
                    oVM.setProperty("/busy", false);
                    oVM.setProperty("/canCancel", false);

                    this._logError(
                        "_getPreview.error",
                        "Error al consultar la vista previa",
                        {
                            traceId: sTraceId,
                            error: this._serializeError(oError)
                        }
                    );

                    this._showODataError(
                        "Error al consultar la vista previa.",
                        oError
                    );
                }.bind(this)
            });
        },

        _showStatusMessageDialog: function (sMessage, sTitle) {
            this.getVM().setProperty("/statusMessageDialog", {
                title: sTitle || "Mensaje de SAP",
                message: sMessage || "SAP no devolvió un mensaje.",
                sourceText: "Respuesta de SAP"
            });

            if (!this._pStatusMessageDialog) {
                this._pStatusMessageDialog = Fragment.load({
                    id: this.getView().getId(),
                    name:
                        "z.anulacion.anulacion.fragment.StatusMessage",
                    controller: this
                }).then(function (oDialog) {
                    this._oStatusMessageDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }

            this._pStatusMessageDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        onCloseStatusMessageDialog: function () {
            if (this._oStatusMessageDialog) {
                this._oStatusMessageDialog.close();
            }
        },

        _getDeepPreviewHeader: function (oData) {
            var oPayload = oData && oData.d
                ? oData.d
                : oData;
            var aHeaders = oPayload && Array.isArray(oPayload.results)
                ? oPayload.results
                : [];

            if (aHeaders.length) {
                return aHeaders[0];
            }

            return oPayload && oPayload.MatDoc
                ? oPayload
                : null;
        },

        _getDeepPreviewItems: function (oHeader) {
            var oNavigation = oHeader && oHeader.ToItems;

            if (Array.isArray(oNavigation)) {
                return oNavigation;
            }

            return oNavigation && Array.isArray(oNavigation.results)
                ? oNavigation.results
                : [];
        },

        _mapDeepPreviewItems: function (oHeader, aItems) {
            var mHuProviders = {};
            var aPreviewItems = [];

            (aItems || []).forEach(function (oItem) {
                var sHuKey = this._getHuKey(oItem);
                var sProviderKey = String(
                    oItem.Lifnr || oItem.Name1 || ""
                ).trim();

                mHuProviders[sHuKey] = mHuProviders[sHuKey] || {};

                if (sProviderKey) {
                    mHuProviders[sHuKey][sProviderKey] = true;
                }
            }.bind(this));

            (aItems || []).forEach(function (oItem) {
                var sHuKey = this._getHuKey(oItem);
                var iProviderCount = Object.keys(
                    mHuProviders[sHuKey] || {}
                ).length;

                [
                    {
                        Message: "Documento del material",
                        MatDoc: oItem.GrMatDoc,
                        ObjKey1: oItem.GrYear
                    },
                    {
                        Message: "Pedido de compra",
                        MatDoc: oItem.Ebeln,
                        ObjKey1: oItem.GrMatDoc
                    },
                    {
                        Message: "Pedido de ventas",
                        MatDoc: oItem.SoVbeln,
                        ObjKey1: oItem.Ebeln
                    },
                    {
                        Message: "Entrega de salida",
                        MatDoc: oItem.DelivVbeln,
                        ObjKey1: oItem.SoVbeln
                    }
                ].forEach(function (oDocument) {
                    if (!String(oDocument.MatDoc || "").trim()) {
                        return;
                    }

                    aPreviewItems.push({
                        HeaderMatDoc: oHeader.MatDoc || "",
                        MatDoc: oDocument.MatDoc,
                        ObjTipo: "",
                        ObjKey1: oDocument.ObjKey1 || "",
                        ObjKey2: "",
                        ObjKey3: "",
                        Status: oHeader.Status || "",
                        Message: oDocument.Message
                    });
                });

                aPreviewItems.push(Object.assign({}, oItem, {
                    HeaderMatDoc: oHeader.MatDoc || "",
                    Status: oHeader.Status || "",
                    Message: "HU",
                    ObjTipo: oItem.GrYear || "",
                    ObjKey1: oItem.HuVenum || "",
                    ObjKey2: oItem.GrMatDoc || "",
                    ObjKey3: oItem.SoVbeln || "",
                    ProveedorCount: iProviderCount,
                    MultiProveedor: iProviderCount > 1 ? "X" : ""
                }));
            }.bind(this));

            return aPreviewItems;
        },

        _hasValidPreviewData: function (aResults) {
            return (aResults || []).some(function (oItem) {
                return !!(
                    oItem &&
                    (
                        oItem.MatDoc ||
                        oItem.Message ||
                        oItem.ObjTipo ||
                        oItem.ObjKey1 ||
                        oItem.ObjKey2 ||
                        oItem.HuVenum ||
                        oItem.HuExidv
                    )
                );
            });
        },

        _isHU: function (oItem) {
            return String(
                oItem && oItem.Message || ""
            ).trim().toUpperCase() === "HU";
        },

        _getHuKey: function (oItem) {
            return [
                "HU",
                oItem.HuVenum || oItem.ObjKey1 || "",
                oItem.HuExidv || oItem.MatDoc || ""
            ].join("|");
        },

        _getObjectGroupKey: function (oItem) {
            var sMessage = String(
                oItem && oItem.Message || ""
            ).trim().toUpperCase();

            if (this._isHU(oItem)) {
                return "HU";
            }

            if (
                sMessage.indexOf("DOCUMENTO") >= 0 &&
                sMessage.indexOf("MATERIAL") >= 0
            ) {
                return "DOCUMENTO_MATERIAL";
            }

            if (sMessage.indexOf("PEDIDO DE COMPRA") >= 0) {
                return "PEDIDO_COMPRA";
            }

            if (
                sMessage.indexOf("PEDIDO DE VENTA") >= 0 ||
                sMessage.indexOf("PEDIDO DE VENTAS") >= 0
            ) {
                return "PEDIDO_VENTA";
            }

            if (sMessage.indexOf("TRANSPORTE") >= 0) {
                return "TRANSPORTE";
            }

            if (sMessage.indexOf("ENTREGA") >= 0) {
                return "ENTREGA_SALIDA";
            }

            return String(
                oItem && oItem.ObjTipo || sMessage || "OTRO"
            ).trim().toUpperCase();
        },

        _getPreviewObjectKey: function (oItem) {
            var sMatDoc = String(
                oItem && oItem.MatDoc || ""
            ).trim();

            if (sMatDoc) {
                return [
                    this._getObjectGroupKey(oItem),
                    sMatDoc
                ].join("|");
            }

            return [
                this._getObjectGroupKey(oItem),
                oItem.ObjKey1 || "",
                oItem.ObjKey2 || "",
                oItem.ObjKey3 || "",
                oItem.MatDoc || "",
                oItem.HuVenum || "",
                oItem.HuExidv || ""
            ].join("|");
        },

        _buildPreviewRows: function (aResults) {
            var aRows = [];
            var mHuRows = {};
            var mObjectRows = {};

            (aResults || []).forEach(function (oRawItem) {
                var oItem = Object.assign({}, oRawItem);

                if (!this._isHU(oItem)) {
                    var sObjectKey = this._getPreviewObjectKey(oItem);

                    if (mObjectRows[sObjectKey]) {
                        return;
                    }

                    mObjectRows[sObjectKey] = true;
                    oItem.providerOptions = [];
                    oItem.ProviderSummaries = [];
                    oItem.PurchaseOrderSummaries = [];
                    oItem.selectedProviders = [];
                    oItem.selectedProvider = null;
                    oItem.providerSelectionRequired = false;

                    this._decoratePreviewRow(oItem);
                    aRows.push(oItem);
                    return;
                }

                var sHuKey = this._getHuKey(oItem);

                if (!mHuRows[sHuKey]) {
                    mHuRows[sHuKey] = Object.assign({}, oItem, {
                        providerOptions: [],
                        huMaterialDetails: [],
                        selectedProviders: [],
                        selectedProvider: null,
                        providerSelectionRequired:
                            oItem.MultiProveedor === "X" ||
                            Number(oItem.ProveedorCount || 0) > 1
                    });

                    aRows.push(mHuRows[sHuKey]);
                }

                if (oItem.Lifnr || oItem.Name1 || oItem.Ebeln) {
                    var sProviderKey = [
                        oItem.SeqNo === null ||
                        oItem.SeqNo === undefined
                            ? ""
                            : String(oItem.SeqNo),
                        oItem.Lifnr || "",
                        oItem.Ebeln || "",
                        oItem.HuVenum || "",
                        oItem.HuExidv || "",
                        oItem.GrMatDoc || "",
                        oItem.Charg || "",
                        oItem.Matnr || ""
                    ].join("|");

                    var oProviderOption =
                        mHuRows[sHuKey].providerOptions.find(
                            function (oProvider) {
                                return oProvider.providerKey === sProviderKey;
                            }
                        );

                    if (!oProviderOption) {
                        oProviderOption = {
                            providerKey: sProviderKey,
                            Lifnr: oItem.Lifnr || "",
                            Name1: oItem.Name1 || "",
                            Ebeln: oItem.Ebeln || "",
                            HuVenum: oItem.HuVenum || "",
                            HuExidv: oItem.HuExidv || "",
                            SeqNo: oItem.SeqNo,
                            GrMatDoc: oItem.GrMatDoc || "",
                            GrYear: oItem.GrYear || "",
                            SoVbeln: oItem.SoVbeln || "",
                            DelivVbeln: oItem.DelivVbeln || "",
                            itemDetails: [],
                            Charg: "",
                            Menge: "",
                            Meins: "",
                            Matnr: "",
                            Maktx: "",
                            MaterialExpanded: false,
                            selected: false
                        };

                        mHuRows[sHuKey].providerOptions.push(
                            oProviderOption
                        );
                    }

                    this._appendProviderItemDetail(
                        oProviderOption,
                        oItem
                    );
                } else {
                    this._appendProviderItemDetail(
                        {
                            itemDetails:
                                mHuRows[sHuKey].huMaterialDetails
                        },
                        oItem
                    );
                }
            }.bind(this));

            aRows.forEach(function (oRow) {
                if (this._isHU(oRow)) {
                    this._buildHuOptionSummaries(oRow);
                    oRow.providerSelectionRequired =
                        oRow.MultiProveedor === "X" ||
                        oRow.SelectionOptionCount > 1;

                    if (oRow.providerOptions.length === 1) {
                        this._applySelectedProvidersToRow(
                            oRow,
                            [oRow.providerOptions[0]]
                        );
                    }
                }

                this._decoratePreviewRow(oRow);
            }.bind(this));

            var aHuRows = aRows.filter(function (oRow) {
                return this._isHU(oRow);
            }.bind(this));
            var bRequiresHuChoice = aHuRows.length > 1;

            aHuRows.forEach(function (oRow) {
                oRow.HuSelectionRequired = bRequiresHuChoice;
                oRow.HuSelected = !bRequiresHuChoice;
                this._decoratePreviewRow(oRow);
            }.bind(this));

            return aRows;
        },

        _appendProviderItemDetail: function (oProvider, oItem) {
            var oDetail = {
                SeqNo: oItem.SeqNo,
                GrMatDoc: String(oItem.GrMatDoc || "").trim(),
                GrYear: String(oItem.GrYear || "").trim(),
                SoVbeln: String(oItem.SoVbeln || "").trim(),
                DelivVbeln: String(oItem.DelivVbeln || "").trim(),
                Charg: String(oItem.Charg || "").trim(),
                Menge: oItem.Menge === null ||
                    oItem.Menge === undefined
                    ? ""
                    : String(oItem.Menge).trim(),
                Meins: String(oItem.Meins || "").trim(),
                Matnr: String(oItem.Matnr || "").trim(),
                Maktx: String(
                    oItem.Maktx ||
                    oItem.MaterialDescription ||
                    oItem.MatDesc ||
                    ""
                ).trim()
            };

            if (
                !oDetail.GrMatDoc &&
                !oDetail.GrYear &&
                !oDetail.SoVbeln &&
                !oDetail.DelivVbeln &&
                !oDetail.Charg &&
                !oDetail.Menge &&
                !oDetail.Meins &&
                !oDetail.Matnr &&
                !oDetail.Maktx
            ) {
                return;
            }

            var aDetails = oProvider.itemDetails || [];
            var sDetailKey = [
                oDetail.SeqNo === null ||
                oDetail.SeqNo === undefined
                    ? ""
                    : String(oDetail.SeqNo),
                oDetail.GrMatDoc,
                oDetail.GrYear,
                oDetail.SoVbeln,
                oDetail.DelivVbeln,
                oDetail.Charg,
                oDetail.Menge,
                oDetail.Meins,
                oDetail.Matnr,
                oDetail.Maktx
            ].join("|");
            var bExists = aDetails.some(function (oExistingDetail) {
                return [
                    oExistingDetail.SeqNo === null ||
                    oExistingDetail.SeqNo === undefined
                        ? ""
                        : String(oExistingDetail.SeqNo),
                    oExistingDetail.GrMatDoc || "",
                    oExistingDetail.GrYear || "",
                    oExistingDetail.SoVbeln || "",
                    oExistingDetail.DelivVbeln || "",
                    oExistingDetail.Charg || "",
                    oExistingDetail.Menge || "",
                    oExistingDetail.Meins || "",
                    oExistingDetail.Matnr || "",
                    oExistingDetail.Maktx || ""
                ].join("|") === sDetailKey;
            });

            if (!bExists) {
                aDetails.push(oDetail);
            }

            oProvider.itemDetails = aDetails;
            [
                "GrMatDoc",
                "GrYear",
                "SoVbeln",
                "DelivVbeln",
                "Charg",
                "Menge",
                "Meins",
                "Matnr",
                "Maktx"
            ].forEach(
                function (sProperty) {
                    oProvider[sProperty] = aDetails
                        .map(function (oEntry) {
                            var sValue = String(
                                oEntry[sProperty] || ""
                            ).trim();

                            return sValue || "-";
                        })
                        .join(" / ");
                }.bind(this)
            );

            oProvider.DisplayMatnr = aDetails
                .map(function (oEntry) {
                    return this._getLastTenDigits(
                        oEntry.Matnr
                    ) || "-";
                }.bind(this))
                .join(" / ");
        },

        _buildHuOptionSummaries: function (oRow) {
            var mProviders = {};
            var mPurchaseOrders = {};
            var aProviders = [];
            var aPurchaseOrders = [];

            (oRow.providerOptions || []).forEach(function (oOption) {
                var sProviderKey = String(
                    oOption.Lifnr || oOption.Name1 || ""
                ).trim();
                var sPurchaseOrder = String(
                    oOption.Ebeln || ""
                ).trim();

                if (sProviderKey && !mProviders[sProviderKey]) {
                    mProviders[sProviderKey] = true;
                    aProviders.push({
                        Lifnr: oOption.Lifnr || "",
                        Name1: oOption.Name1 || ""
                    });
                }

                if (
                    sPurchaseOrder &&
                    !mPurchaseOrders[sPurchaseOrder]
                ) {
                    mPurchaseOrders[sPurchaseOrder] = true;
                    aPurchaseOrders.push({
                        Ebeln: sPurchaseOrder
                    });
                }
            });

            oRow.ProviderSummaries = aProviders;
            oRow.PurchaseOrderSummaries = aPurchaseOrders;
            oRow.ProveedorCount = aProviders.length;
            oRow.PurchaseOrderCount = aPurchaseOrders.length;
            oRow.SelectionOptionCount =
                (oRow.providerOptions || []).length;
            oRow.ProviderCountText = aProviders.length === 1
                ? "1 proveedor"
                : aProviders.length + " proveedores";
            oRow.PurchaseOrderCountText =
                aPurchaseOrders.length === 1
                    ? "1 pedido"
                    : aPurchaseOrders.length + " pedidos";
        },

        _getLastTenDigits: function (sValue) {
            var sText = String(
                sValue === null || sValue === undefined
                    ? ""
                    : sValue
            ).trim();

            return sText.length > 10
                ? sText.slice(-10)
                : sText;
        },

        _getRowDocumentNumber: function (oRow) {
            if (this._isHU(oRow)) {
                return String(
                    oRow.HuExidv || oRow.HuVenum || ""
                ).trim();
            }

            return String(
                oRow.MatDoc ||
                oRow.ObjKey1 ||
                oRow.ObjKey2 ||
                ""
            ).trim();
        },

        _buildMaterialDetails: function (aRawDetails) {
            return (aRawDetails || []).map(
                function (oDetail, iMaterialIndex) {
                    var sDescription = String(
                        oDetail.Maktx ||
                        oDetail.MaterialDescription ||
                        oDetail.MatDesc ||
                        ""
                    ).trim();

                    var sMatnr = String(
                        oDetail.Matnr || ""
                    ).trim();

                    return {
                        MaterialPosition: iMaterialIndex + 1,
                        Matnr: sMatnr,
                        DisplayMatnr:
                            this._getLastTenDigits(sMatnr),
                        Maktx: sDescription ||
                            "Sin nombre disponible",
                        Menge: oDetail.Menge === null ||
                            oDetail.Menge === undefined
                            ? ""
                            : String(oDetail.Menge).trim(),
                        Meins: String(
                            oDetail.Meins || ""
                        ).trim(),
                        Charg: String(
                            oDetail.Charg || ""
                        ).trim()
                    };
                }.bind(this)
            );
        },

        _buildHuFlowOptions: function (oRow, sPreviewPath) {
            var mSelectedKeys = {};

            (oRow.selectedProviders || []).forEach(function (oProvider) {
                if (oProvider && oProvider.providerKey) {
                    mSelectedKeys[oProvider.providerKey] = true;
                }
            });

            return (oRow.providerOptions || []).map(
                function (oOption, iOptionIndex) {
                    var aRawDetails = Array.isArray(oOption.itemDetails) &&
                        oOption.itemDetails.length
                        ? oOption.itemDetails
                        : [oOption];
                    var aMaterialDetails =
                        this._buildMaterialDetails(aRawDetails);

                    return Object.assign({}, oOption, {
                        HuPreviewPath: sPreviewPath,
                        HuSelected: oRow.HuSelected === true,
                        FlowPosition: iOptionIndex + 1,
                        MaterialExpanded:
                            oOption.MaterialExpanded === true,
                        selected: oRow.HuSelected === true &&
                            !!mSelectedKeys[oOption.providerKey],
                        MaterialDetails: aMaterialDetails,
                        MaterialCountText:
                            aMaterialDetails.length === 1
                                ? "1 material"
                                : aMaterialDetails.length + " materiales"
                    });
                }.bind(this)
            );
        },

        _buildPreviewDisplayRows: function (aPreview, mExpandedGroups) {
            var aGroupOrder = [];
            var mGroups = {};
            var aDisplayRows = [];

            (aPreview || []).forEach(function (oRow, iPreviewIndex) {
                // La vista operativa parte exclusivamente de las HU.
                // Los demas objetos siguen disponibles en /preview y en
                // el resumen, pero no compiten con el flujo seleccionable.
                if (!this._isHU(oRow)) {
                    return;
                }

                var sGroupKey = this._getObjectGroupKey(oRow);

                if (!mGroups[sGroupKey]) {
                    mGroups[sGroupKey] = [];
                    aGroupOrder.push(sGroupKey);
                }

                mGroups[sGroupKey].push({
                    row: oRow,
                    previewIndex: iPreviewIndex
                });
            }.bind(this));

            aGroupOrder.forEach(function (sGroupKey) {
                var aGroupRows = mGroups[sGroupKey];
                var mDocumentNumbers = {};
                var aDocumentNumbers = [];
                var aDocumentRows = [];
                var bExpanded = !!(
                    mExpandedGroups &&
                    mExpandedGroups[sGroupKey]
                );

                aGroupRows.forEach(function (oEntry) {
                    var sDocumentNumber =
                        this._getRowDocumentNumber(oEntry.row);
                    var sDocumentKey = sDocumentNumber ||
                        "ROW_" + oEntry.previewIndex;

                    if (
                        !mDocumentNumbers[sDocumentKey]
                    ) {
                        mDocumentNumbers[sDocumentKey] = true;
                        aDocumentRows.push(oEntry);

                        if (sDocumentNumber) {
                            aDocumentNumbers.push(sDocumentNumber);
                        }
                    }
                }.bind(this));

                var bCanExpand = aDocumentNumbers.length > 0;
                var oGroupEntry = aDocumentRows[0];
                var iDocumentCount = aDocumentRows.length;
                var sGroupCountText = "";
                var sGroupToggleTooltip = "Ocultar HU";

                if (!bCanExpand) {
                    aDisplayRows.push(Object.assign(
                        {},
                        oGroupEntry.row,
                        {
                            PreviewPath:
                                "/preview/" +
                                oGroupEntry.previewIndex,
                            GroupKey: sGroupKey,
                            GroupItemCount: 0,
                            CanExpand: false,
                            Expanded: false,
                            IsGroupHeader: false,
                            IsChildRow: false
                        }
                    ));
                    return;
                }

                if (this._isHU(oGroupEntry.row)) {
                    sGroupCountText = iDocumentCount === 1
                        ? "1 HU"
                        : iDocumentCount + " HU";
                } else {
                    sGroupCountText = iDocumentCount === 1
                        ? "1 documento"
                        : iDocumentCount + " documentos";
                }

                if (!bExpanded) {
                    sGroupToggleTooltip = iDocumentCount === 1
                        ? "Mostrar 1 HU"
                        : "Mostrar " + iDocumentCount + " HU";
                }

                aDisplayRows.push(Object.assign({}, oGroupEntry.row, {
                    PreviewPath:
                        "/preview/" + oGroupEntry.previewIndex,
                    GroupKey: sGroupKey,
                    GroupItemCount: iDocumentCount,
                    CanExpand: true,
                    Expanded: bExpanded,
                    IsGroupHeader: true,
                    IsChildRow: false,
                    GroupPosition: 0,
                    GroupCountText: sGroupCountText,
                    GroupDocumentsText: bExpanded
                        ? "Ocultar HU"
                        : "Ver HU disponibles",
                    GroupToggleTooltip: sGroupToggleTooltip,
                    DisplayReference1: "",
                    DisplayReference2: "",
                    FlowOptions: [],
                    ProviderSummaries: [],
                    PurchaseOrderSummaries: [],
                    DisplayStatusText:
                        this._getGroupStatusText(
                            aDocumentRows,
                            oGroupEntry.row
                        ),
                    DisplayStatusState:
                        this._getGroupStatusState(
                            aDocumentRows,
                            oGroupEntry.row
                        )
                }));

                if (!bExpanded) {
                    return;
                }

                aDocumentRows.forEach(function (oEntry, iGroupIndex) {
                    var sPreviewPath =
                        "/preview/" + oEntry.previewIndex;
                    var aHuMaterialDetails =
                        this._buildMaterialDetails(
                            oEntry.row.huMaterialDetails || []
                        );
                    var bCanExpandHuFlow =
                        this._isHU(oEntry.row) &&
                        (
                            (oEntry.row.providerOptions || []).length > 0 ||
                            aHuMaterialDetails.length > 0
                        );
                    var bHuFlowExpanded =
                        oEntry.row.HuFlowExpanded === true;

                    aDisplayRows.push(Object.assign({}, oEntry.row, {
                        PreviewPath: sPreviewPath,
                        GroupKey: sGroupKey,
                        GroupItemCount: aDocumentRows.length,
                        CanExpand: false,
                        Expanded: false,
                        IsGroupHeader: false,
                        IsChildRow: true,
                        GroupPosition: iGroupIndex + 1,
                        CanExpandHuFlow: bCanExpandHuFlow,
                        HuFlowExpanded: bHuFlowExpanded,
                        HuFlowToggleTooltip: bHuFlowExpanded
                            ? "Ocultar detalle de esta HU"
                            : "Mostrar detalle de esta HU",
                        HasHuMaterialDetails:
                            aHuMaterialDetails.length > 0,
                        HuMaterialDetails: aHuMaterialDetails,
                        HuMaterialCountText:
                            aHuMaterialDetails.length === 1
                                ? "1 material sin pedido"
                                : aHuMaterialDetails.length +
                                    " materiales sin pedido",
                        GroupCountText: "",
                        GroupDocumentsText: "",
                        FlowOptions: this._isHU(oEntry.row)
                            ? this._buildHuFlowOptions(
                                oEntry.row,
                                sPreviewPath
                            )
                            : []
                    }));
                }.bind(this));
            }.bind(this));

            return aDisplayRows;
        },

        _getGroupStatusText: function (aDocumentRows, oFallbackRow) {
            if (!this._isHU(oFallbackRow)) {
                return oFallbackRow.DisplayStatusText;
            }

            var aHuRows = (aDocumentRows || []).map(function (oEntry) {
                return oEntry.row;
            });
            var aSelectedHu = aHuRows.filter(function (oRow) {
                return oRow.HuSelected === true;
            });

            if (aHuRows.length > 1 && !aSelectedHu.length) {
                return "Selecciona una o varias HU";
            }

            if (aHuRows.length > 1) {
                var bHasPendingOrders = aSelectedHu.some(
                    function (oRow) {
                        return oRow.providerSelectionRequired &&
                            !(oRow.selectedProviders || []).length;
                    }
                );
                var sSelectedText = aSelectedHu.length === 1
                    ? "1 HU seleccionada"
                    : aSelectedHu.length + " HU seleccionadas";

                return bHasPendingOrders
                    ? sSelectedText + " · pedidos pendientes"
                    : sSelectedText;
            }

            return (aSelectedHu[0] || oFallbackRow).DisplayStatusText;
        },

        _getGroupStatusState: function (aDocumentRows, oFallbackRow) {
            if (!this._isHU(oFallbackRow)) {
                return oFallbackRow.DisplayStatusState;
            }

            var aHuRows = (aDocumentRows || []).map(function (oEntry) {
                return oEntry.row;
            });
            var aSelectedHu = aHuRows.filter(function (oRow) {
                return oRow.HuSelected === true;
            });

            if (aHuRows.length > 1 && !aSelectedHu.length) {
                return "Warning";
            }

            if (aSelectedHu.some(function (oRow) {
                return oRow.providerSelectionRequired &&
                    !(oRow.selectedProviders || []).length;
            })) {
                return "Warning";
            }

            return aHuRows.length > 1
                ? "Success"
                : (aSelectedHu[0] || oFallbackRow).DisplayStatusState;
        },

        _refreshPreviewDisplay: function () {
            var oVM = this.getVM();
            var aPreview = oVM.getProperty("/preview") || [];
            var mExpandedGroups =
                oVM.getProperty("/expandedPreviewGroups") || {};

            oVM.setProperty(
                "/previewDisplay",
                this._buildPreviewDisplayRows(
                    aPreview,
                    mExpandedGroups
                )
            );
        },

        onTogglePreviewGroup: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");
            var oDisplayRow = oContext && oContext.getObject();

            if (!oDisplayRow || !oDisplayRow.GroupKey) {
                return;
            }

            var oVM = this.getVM();
            var mExpandedGroups = Object.assign(
                {},
                oVM.getProperty("/expandedPreviewGroups") || {}
            );

            mExpandedGroups[oDisplayRow.GroupKey] =
                !mExpandedGroups[oDisplayRow.GroupKey];

            oVM.setProperty(
                "/expandedPreviewGroups",
                mExpandedGroups
            );
            this._refreshPreviewDisplay();
        },

        onToggleHuFlow: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");
            var oDisplayRow = oContext && oContext.getObject();
            var sPreviewPath = oDisplayRow && oDisplayRow.PreviewPath;

            if (!sPreviewPath) {
                return;
            }

            var oVM = this.getVM();
            var aPreview = oVM.getProperty("/preview") || [];

            if (this._updateHuFlowExpansion(
                aPreview,
                sPreviewPath,
                !oDisplayRow.HuFlowExpanded
            )) {
                oVM.setProperty("/preview", aPreview);
                this._refreshPreviewDisplay();
            }
        },

        _updateHuFlowExpansion: function (
            aPreview,
            sPreviewPath,
            bExpanded
        ) {
            var bUpdated = false;

            (aPreview || []).forEach(function (oRow, iIndex) {
                if (
                    !this._isHU(oRow) ||
                    "/preview/" + iIndex !== sPreviewPath
                ) {
                    return;
                }

                oRow.HuFlowExpanded = bExpanded;
                bUpdated = true;
            }.bind(this));

            return bUpdated;
        },

        onSelectHu: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");
            var oDisplayRow = oContext && oContext.getObject();
            var sSelectedPath =
                oDisplayRow && oDisplayRow.PreviewPath;
            var bSelected = oEvent.getParameter("selected") !== false;

            if (!sSelectedPath) {
                return;
            }

            var oVM = this.getVM();
            var aPreview = oVM.getProperty("/preview") || [];
            var bUpdated = this._updateHuSelection(
                aPreview,
                sSelectedPath,
                bSelected
            );

            if (!bUpdated) {
                return;
            }

            oVM.setProperty("/preview", aPreview);
            this._refreshPreviewDisplay();
            this._updateSummary(aPreview);
            this._evaluatePreviewBeforeCancel(aPreview);

            var iSelectedHu = aPreview.filter(function (oRow) {
                return this._isHU(oRow) && oRow.HuSelected === true;
            }.bind(this)).length;

            MessageToast.show(bSelected
                ? iSelectedHu === 1
                    ? "1 HU seleccionada."
                    : iSelectedHu + " HU seleccionadas."
                    : "Selección de HU eliminada."
            );
        },

        onSelectAllHu: function () {
            var oVM = this.getVM();

            if (oVM.getProperty("/busy")) {
                return;
            }

            var aPreview = oVM.getProperty("/preview") || [];
            var iSelectedHu = this._selectAllHuRows(aPreview);

            if (!iSelectedHu) {
                MessageToast.show("No hay HU disponibles para seleccionar.");
                return;
            }

            oVM.setProperty("/preview", aPreview);
            this._refreshPreviewDisplay();
            this._updateSummary(aPreview);
            this._evaluatePreviewBeforeCancel(aPreview);

            MessageToast.show(
                iSelectedHu === 1
                    ? "1 HU seleccionada con todos sus pedidos."
                    : iSelectedHu +
                        " HU seleccionadas con todos sus pedidos."
            );
        },

        _selectAllHuRows: function (aPreview) {
            var iSelectedHu = 0;

            (aPreview || []).forEach(function (oRow, iIndex) {
                if (!this._isHU(oRow)) {
                    return;
                }

                if (this._updateHuSelection(
                    aPreview,
                    "/preview/" + iIndex,
                    true
                )) {
                    iSelectedHu++;
                }
            }.bind(this));

            return iSelectedHu;
        },

        _updateHuSelection: function (
            aPreview,
            sSelectedPath,
            bSelected
        ) {
            var bUpdated = false;

            (aPreview || []).forEach(function (oRow, iIndex) {
                if (
                    !this._isHU(oRow) ||
                    "/preview/" + iIndex !== sSelectedPath
                ) {
                    return;
                }

                oRow.HuSelected = bSelected;
                if (bSelected) {
                    oRow.HuFlowExpanded = true;
                }

                // La HU funciona como selector maestro: al activarla se
                // incluyen todos sus pedidos; al desactivarla se limpian.
                // Después, cada pedido puede ajustarse individualmente.
                this._applySelectedProvidersToRow(
                    oRow,
                    bSelected ? (oRow.providerOptions || []) : []
                );
                bUpdated = true;
            }.bind(this));

            return bUpdated;
        },

        onInlineOrderSelection: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");
            var oFlowOption = oContext && oContext.getObject();
            var sRowPath = oFlowOption &&
                oFlowOption.HuPreviewPath;
            var bSelected = oEvent.getParameter("selected") !== false;

            if (!sRowPath || !oFlowOption.providerKey) {
                return;
            }

            var oVM = this.getVM();
            var oRow = oVM.getProperty(sRowPath);

            if (!oRow) {
                return;
            }

            // Permite elegir directamente un pedido. La HU se activa de
            // forma automática, pero las demás opciones permanecen libres
            // para que el usuario decida si selecciona una o varias.
            if (bSelected && !oRow.HuSelected) {
                oRow.HuSelected = true;
                oRow.HuFlowExpanded = true;
            }

            var mSelectedKeys = {};

            (oRow.selectedProviders || []).forEach(function (oProvider) {
                if (oProvider && oProvider.providerKey) {
                    mSelectedKeys[oProvider.providerKey] = true;
                }
            });

            if (bSelected) {
                mSelectedKeys[oFlowOption.providerKey] = true;
            } else {
                delete mSelectedKeys[oFlowOption.providerKey];
            }

            var aSelectedProviders = (oRow.providerOptions || [])
                .filter(function (oProvider) {
                    return !!mSelectedKeys[oProvider.providerKey];
                });

            oRow.providerOptions.forEach(function (oProvider) {
                oProvider.selected =
                    !!mSelectedKeys[oProvider.providerKey];

                if (
                    bSelected &&
                    oProvider.providerKey ===
                        oFlowOption.providerKey
                ) {
                    oProvider.MaterialExpanded = true;
                }
            });

            this._applySelectedProvidersToRow(
                oRow,
                aSelectedProviders
            );

            oVM.setProperty(sRowPath, oRow);

            var aPreview = oVM.getProperty("/preview") || [];

            this._refreshPreviewDisplay();
            this._updateSummary(aPreview);
            this._evaluatePreviewBeforeCancel(aPreview);

            MessageToast.show(
                aSelectedProviders.length === 1
                    ? "1 pedido seleccionado para esta HU."
                    : aSelectedProviders.length +
                        " pedidos seleccionados para esta HU."
            );
        },

        onToggleOrderMaterials: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");
            var oFlowOption = oContext && oContext.getObject();
            var sPreviewPath = oFlowOption &&
                oFlowOption.HuPreviewPath;

            if (
                !sPreviewPath ||
                !oFlowOption.providerKey
            ) {
                return;
            }

            var oVM = this.getVM();
            var aPreview = oVM.getProperty("/preview") || [];

            if (this._updateOrderMaterialExpansion(
                aPreview,
                sPreviewPath,
                oFlowOption.providerKey,
                !oFlowOption.MaterialExpanded
            )) {
                oVM.setProperty("/preview", aPreview);
                this._refreshPreviewDisplay();
            }
        },

        _updateOrderMaterialExpansion: function (
            aPreview,
            sPreviewPath,
            sProviderKey,
            bExpanded
        ) {
            var bUpdated = false;

            (aPreview || []).forEach(function (oRow, iIndex) {
                if (
                    !this._isHU(oRow) ||
                    "/preview/" + iIndex !== sPreviewPath
                ) {
                    return;
                }

                (oRow.providerOptions || []).forEach(
                    function (oProvider) {
                        if (
                            oProvider.providerKey !==
                                sProviderKey
                        ) {
                            return;
                        }

                        oProvider.MaterialExpanded = bExpanded;
                        bUpdated = true;
                    }
                );
            }.bind(this));

            return bUpdated;
        },

        _decoratePreviewRow: function (oRow) {
            var aRelatedReferences = [];

            oRow.IsHU = this._isHU(oRow);
            oRow.DisplayIcon = this._getObjectIcon(oRow.Message);
            oRow.DisplayStatusText = this._getPreviewStatusText(oRow);
            oRow.DisplayStatusState = this._getPreviewStatusState(oRow);
            oRow.DisplayReference1 = this._isHU(oRow)
                ? (oRow.HuExidv || "")
                : (oRow.MatDoc || oRow.ObjKey1 || "");
            oRow.DisplayReference1Short =
                this._getLastTenDigits(
                    oRow.DisplayReference1
                );

            [oRow.ObjKey1, oRow.ObjKey2, oRow.ObjKey3]
                .forEach(function (sReference) {
                    var sCleanReference =
                        String(sReference || "").trim();

                    if (
                        sCleanReference &&
                        sCleanReference !== oRow.DisplayReference1 &&
                        aRelatedReferences.indexOf(sCleanReference) < 0
                    ) {
                        aRelatedReferences.push(sCleanReference);
                    }
                });

            oRow.DisplayReference2 = this._isHU(oRow)
                ? (oRow.HuVenum || "")
                : aRelatedReferences.join(" · ");
        },

        _getObjectIcon: function (sMessage) {
            var sValue = String(sMessage || "")
                .trim()
                .toUpperCase();

            if (sValue === "HU") {
                return "sap-icon://product";
            }

            if (
                sValue.indexOf("DOCUMENTO") >= 0 &&
                sValue.indexOf("MATERIAL") >= 0
            ) {
                return "sap-icon://document-text";
            }

            if (sValue.indexOf("PEDIDO DE COMPRA") >= 0) {
                return "sap-icon://cart";
            }

            if (
                sValue.indexOf("PEDIDO DE VENTA") >= 0 ||
                sValue.indexOf("PEDIDO DE VENTAS") >= 0
            ) {
                return "sap-icon://sales-order";
            }

            if (
                sValue.indexOf("ENTREGA") >= 0 ||
                sValue.indexOf("TRANSPORTE") >= 0
            ) {
                return "sap-icon://shipping-status";
            }

            if (
                sValue.indexOf("NO ENCONTRADO") >= 0 ||
                sValue.indexOf("NO ENCONTRADA") >= 0 ||
                sValue.indexOf("SIN TRANSPORTE") >= 0
            ) {
                return "sap-icon://message-warning";
            }

            return "sap-icon://document";
        },

        _getPreviewStatusText: function (oRow) {
            var sMessage = String(oRow.Message || "")
                .trim()
                .toUpperCase();

            if (oRow.Status === "E") {
                return "Error";
            }

            if (oRow.Status === "W") {
                return "Advertencia";
            }

            if (
                this._isHU(oRow) &&
                oRow.HuSelectionRequired &&
                !oRow.HuSelected
            ) {
                return "Disponible";
            }

            if (
                this._isHU(oRow) &&
                oRow.HuSelectionRequired &&
                oRow.HuSelected &&
                !oRow.providerSelectionRequired
            ) {
                return "HU seleccionada";
            }

            if (
                this._isHU(oRow) &&
                oRow.providerSelectionRequired &&
                !(oRow.selectedProviders && oRow.selectedProviders.length)
            ) {
                return "Selección requerida";
            }

            if (
                sMessage.indexOf("NO ENCONTRADO") >= 0 ||
                sMessage.indexOf("NO ENCONTRADA") >= 0
            ) {
                return "No encontrado";
            }

            if (sMessage.indexOf("SIN TRANSPORTE") >= 0) {
                return "No aplica";
            }

            return "Encontrado";
        },

        _getPreviewStatusState: function (oRow) {
            var sMessage = String(oRow.Message || "")
                .trim()
                .toUpperCase();

            if (oRow.Status === "E") {
                return "Error";
            }

            if (oRow.Status === "W") {
                return "Warning";
            }

            if (
                this._isHU(oRow) &&
                oRow.HuSelectionRequired &&
                !oRow.HuSelected
            ) {
                return "Information";
            }

            if (
                this._isHU(oRow) &&
                oRow.HuSelectionRequired &&
                oRow.HuSelected &&
                !oRow.providerSelectionRequired
            ) {
                return "Success";
            }

            if (
                this._isHU(oRow) &&
                oRow.providerSelectionRequired &&
                !(oRow.selectedProviders && oRow.selectedProviders.length)
            ) {
                return "Warning";
            }

            if (
                sMessage.indexOf("NO ENCONTRADO") >= 0 ||
                sMessage.indexOf("NO ENCONTRADA") >= 0
            ) {
                return "Warning";
            }

            if (sMessage.indexOf("SIN TRANSPORTE") >= 0) {
                return "None";
            }

            return "Success";
        },

        _applySelectedProvidersToRow: function (oRow, aProviders) {
            var aSelectedProviders = (aProviders || []).map(function (oProvider) {
                return Object.assign({}, oProvider, {
                    selected: true
                });
            });
            var mSelectedProviderKeys = {};

            aSelectedProviders.forEach(function (oProvider) {
                if (oProvider.providerKey) {
                    mSelectedProviderKeys[oProvider.providerKey] = true;
                }
            });

            (oRow.providerOptions || []).forEach(function (oProvider) {
                oProvider.selected =
                    !!mSelectedProviderKeys[oProvider.providerKey];
            });

            var oFirstProvider = aSelectedProviders.length
                ? aSelectedProviders[0]
                : null;

            oRow.selectedProviders = aSelectedProviders;

            // Compatibilidad con la lógica/vista anterior:
            // selectedProvider conserva el primer proveedor seleccionado.
            oRow.selectedProvider = oFirstProvider
                ? Object.assign({}, oFirstProvider)
                : null;

            oRow.Lifnr = oFirstProvider
                ? (oFirstProvider.Lifnr || "")
                : "";

            oRow.Name1 = oFirstProvider
                ? (oFirstProvider.Name1 || "")
                : "";

            oRow.Ebeln = oFirstProvider
                ? (oFirstProvider.Ebeln || "")
                : "";

            oRow.SelectedProviderCount = aSelectedProviders.length;

            oRow.SelectedProviderText = aSelectedProviders.length
                ? aSelectedProviders.map(function (oProvider) {
                    return [
                        oProvider.Lifnr || "",
                        oProvider.Name1 || "",
                        oProvider.Ebeln || ""
                    ].filter(Boolean).join(" - ");
                }).join(" | ")
                : "";

            var bRequiresProvider =
                oRow.MultiProveedor === "X" ||
                Number(oRow.SelectionOptionCount || 0) > 1 ||
                (oRow.providerOptions || []).length > 1;

            oRow.providerSelectionRequired =
                bRequiresProvider &&
                aSelectedProviders.length === 0;

            this._decoratePreviewRow(oRow);
        },

        _updateSummary: function (aItems) {
            var iHU = 0;
            var iMaterial = 0;
            var iOtros = 0;
            var iTotal = 0;
            var iHuPendientes = 0;
            var aHuItems = (aItems || []).filter(function (oItem) {
                return this._isHU(oItem);
            }.bind(this));
            var iSelectedHu = aHuItems.filter(function (oItem) {
                return oItem.HuSelected === true;
            }).length;
            var bHuSelectionPending =
                aHuItems.length > 0 && iSelectedHu === 0;

            (aItems || []).forEach(function (oItem) {
                var sMessage = String(oItem.Message || "")
                    .trim()
                    .toUpperCase();

                var bInformative =
                    sMessage.indexOf("NO ENCONTRADO") >= 0 ||
                    sMessage.indexOf("NO ENCONTRADA") >= 0 ||
                    sMessage.indexOf("SIN TRANSPORTE") >= 0;

                var bHasObject =
                    !!oItem.MatDoc ||
                    !!oItem.ObjTipo ||
                    !!oItem.ObjKey1 ||
                    !!oItem.ObjKey2 ||
                    !!oItem.HuVenum ||
                    !!oItem.HuExidv;

                if (!bHasObject || bInformative) {
                    return;
                }

                iTotal++;

                if (this._isHU(oItem)) {
                    iHU++;

                    if (
                        (
                            !oItem.HuSelectionRequired ||
                            oItem.HuSelected
                        ) &&
                        oItem.providerSelectionRequired &&
                        !(oItem.selectedProviders && oItem.selectedProviders.length)
                    ) {
                        iHuPendientes++;
                    }
                } else if (
                    sMessage.indexOf("DOCUMENTO DEL MATERIAL") >= 0 ||
                    sMessage.indexOf("DOCUMENTO MATERIAL") >= 0
                ) {
                    iMaterial++;
                } else {
                    iOtros++;
                }
            }.bind(this));

            this.getVM().setProperty("/summary", {
                total: iTotal,
                hu: iHU,
                material: iMaterial,
                otros: iOtros,
                huSeleccionadas: iSelectedHu,
                huPendientes:
                    iHuPendientes +
                    (bHuSelectionPending ? 1 : 0),
                huSelectionPending:
                    bHuSelectionPending ? 1 : 0
            });

            var oPreviewHeader = this.getVM().getProperty(
                "/previewHeader"
            );
            var aPreviewItems = this.getVM().getProperty(
                "/previewItems"
            );

            if (
                oPreviewHeader &&
                oPreviewHeader.MatDoc &&
                Array.isArray(aPreviewItems)
            ) {
                this._updateDeepPreviewSummary(
                    oPreviewHeader,
                    aPreviewItems
                );
            }
        },

        _updateDeepPreviewSummary: function (oHeader, aItems) {
            var oSummary = Object.assign(
                {},
                this.getVM().getProperty("/summary") || {}
            );
            var mMaterialDocuments = {};
            var mRelatedDocuments = {};

            (aItems || []).forEach(function (oItem) {
                var sMaterialDocument = String(
                    oItem.GrMatDoc || ""
                ).trim();

                if (sMaterialDocument) {
                    mMaterialDocuments[sMaterialDocument] = true;
                }

                [
                    oItem.Ebeln,
                    oItem.SoVbeln,
                    oItem.DelivVbeln
                ].forEach(function (vDocument) {
                    var sDocument = String(vDocument || "").trim();

                    if (sDocument) {
                        mRelatedDocuments[sDocument] = true;
                    }
                });
            });

            oSummary.hu = Number(oHeader.HuCount) || oSummary.hu || 0;
            oSummary.material = Object.keys(mMaterialDocuments).length;
            oSummary.otros = Object.keys(mRelatedDocuments).length;
            oSummary.total =
                oSummary.hu +
                oSummary.material +
                oSummary.otros;

            this.getVM().setProperty("/summary", oSummary);
        },

        _evaluatePreviewBeforeCancel: function (aResults) {
            var oSummary = this.getVM().getProperty("/summary");

            var bHasErrors = (aResults || []).some(function (oItem) {
                return oItem.Status === "E";
            });

            if (bHasErrors) {
                this.getVM().setProperty("/resultado", {
                    Status: "E",
                    Message:
                        "La vista previa contiene errores. Revisa el detalle antes de anular."
                });

                this.getVM().setProperty("/resultadoState", "Error");
                this.getVM().setProperty("/canCancel", false);
                return;
            }

            if (oSummary.huPendientes > 0) {
                var sPendingMessage = oSummary.huSelectionPending > 0
                    ? "Vista previa obtenida correctamente. Seleccione una o varias HU para continuar."
                    : "Vista previa obtenida correctamente. Seleccione los pedidos de compra de cada HU elegida.";

                this.getVM().setProperty("/resultado", {
                    Status: "W",
                    Message: sPendingMessage
                });

                this.getVM().setProperty("/resultadoState", "Warning");
                this.getVM().setProperty("/canCancel", false);
                return;
            }

            this.getVM().setProperty("/resultado", {
                Status: "S",
                Message:
                    "Vista previa obtenida correctamente. Revisa los objetos relacionados antes de anular."
            });

            this.getVM().setProperty("/resultadoState", "Success");
            this.getVM().setProperty("/canCancel", true);
        },

        _getProviderDialogInfoText: function (oRow, iOptionCount) {
            if (iOptionCount === 1) {
                return [
                    "Esta HU tiene un proveedor y un pedido de compra.",
                    "La opción fue seleccionada automáticamente;",
                    "revisa aquí el lote, cantidad, unidad y material."
                ].join(" ");
            }

            return [
                "Esta HU tiene",
                Number(oRow.ProveedorCount || 0),
                Number(oRow.ProveedorCount || 0) === 1
                    ? "proveedor y"
                    : "proveedores y",
                Number(oRow.PurchaseOrderCount || 0),
                Number(oRow.PurchaseOrderCount || 0) === 1
                    ? "pedido de compra asociado."
                    : "pedidos de compra asociados.",
                "Selecciona una o varias combinaciones para la anulación."
            ].join(" ");
        },

        onOpenProviderDialog: function (oEvent) {
            var oContext = oEvent
                .getSource()
                .getBindingContext("viewModel");

            var oDisplayRow = oContext.getObject();
            var sRowPath = oDisplayRow.PreviewPath || oContext.getPath();
            var oRow = this.getVM().getProperty(sRowPath);

            var aExistingSelections = Array.isArray(oRow.selectedProviders)
                ? oRow.selectedProviders
                : [];

            // Compatibilidad con registros que todavía tengan
            // selectedProvider de la versión anterior.
            if (
                !aExistingSelections.length &&
                oRow.selectedProvider
            ) {
                aExistingSelections = [
                    oRow.selectedProvider
                ];
            }

            var mSelectedKeys = {};

            aExistingSelections.forEach(function (oProvider) {
                if (oProvider && oProvider.providerKey) {
                    mSelectedKeys[oProvider.providerKey] = true;
                }
            });

            var aProviders = (oRow.providerOptions || []).map(
                function (oProvider) {
                    return Object.assign({}, oProvider, {
                        selected:
                            !!mSelectedKeys[oProvider.providerKey]
                    });
                }
            );

            var aSelectedProviderKeys = aProviders
                .filter(function (oProvider) {
                    return oProvider.selected === true;
                })
                .map(function (oProvider) {
                    return oProvider.providerKey;
                });
            var sProviderDialogInfoText =
                this._getProviderDialogInfoText(
                    oRow,
                    aProviders.length
                );

            this.getVM().setProperty("/providerDialog", {
                rowPath: sRowPath,
                huVenum: oRow.HuVenum || oRow.ObjKey1 || "",
                huExidv: oRow.HuExidv || oRow.MatDoc || "",
                providerCount: Number(oRow.ProveedorCount || 0),
                purchaseOrderCount:
                    Number(oRow.PurchaseOrderCount || 0),
                optionCount: aProviders.length,
                infoText: sProviderDialogInfoText,
                providers: aProviders,

                // Nuevo estado para selección múltiple.
                selectedProviderKeys: aSelectedProviderKeys,
                selectedCount: aSelectedProviderKeys.length,
                canConfirm: aSelectedProviderKeys.length > 0,

                // Se conserva por compatibilidad con el fragment anterior.
                selectedProviderKey:
                    aSelectedProviderKeys.length
                        ? aSelectedProviderKeys[0]
                        : ""
            });

            this._logInfo(
                "onOpenProviderDialog",
                "Diálogo de proveedores preparado",
                {
                    rowPath: sRowPath,
                    huVenum: oRow.HuVenum || "",
                    totalProviders: aProviders.length,
                    selectedProviderKeys: aSelectedProviderKeys
                }
            );

            this._openProviderDialog();
        },

        _openProviderDialog: function () {
            if (!this._oProviderDialog) {
                Fragment.load({
                    id: this.getView().getId(),
                    name:
                        "z.anulacion.anulacion.fragment.ProviderSelection",
                    controller: this
                }).then(function (oDialog) {
                    this._oProviderDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    oDialog.open();
                }.bind(this));

                return;
            }

            this._oProviderDialog.open();
        },

        onProviderSelectionChange: function (oEvent) {
            var oVM = this.getVM();
            var oTable = this.byId("providerTable");
            var aProviders =
                oVM.getProperty(
                    "/providerDialog/providers"
                ) || [];

            var aSelectedItems = oTable
                ? oTable.getSelectedItems()
                : [];

            var mSelectedKeys = {};

            aSelectedItems.forEach(function (oItem) {
                var oContext =
                    oItem.getBindingContext("viewModel");

                var oProvider =
                    oContext &&
                    oContext.getObject();

                if (oProvider && oProvider.providerKey) {
                    mSelectedKeys[oProvider.providerKey] = true;
                }
            });

            aProviders.forEach(function (oProvider) {
                oProvider.selected =
                    !!mSelectedKeys[oProvider.providerKey];
            });

            var aSelectedProviderKeys = aProviders
                .filter(function (oProvider) {
                    return oProvider.selected === true;
                })
                .map(function (oProvider) {
                    return oProvider.providerKey;
                });

            oVM.setProperty(
                "/providerDialog/providers",
                aProviders
            );

            oVM.setProperty(
                "/providerDialog/selectedProviderKeys",
                aSelectedProviderKeys
            );

            oVM.setProperty(
                "/providerDialog/selectedProviderKey",
                aSelectedProviderKeys.length
                    ? aSelectedProviderKeys[0]
                    : ""
            );

            oVM.setProperty(
                "/providerDialog/selectedCount",
                aSelectedProviderKeys.length
            );

            oVM.setProperty(
                "/providerDialog/canConfirm",
                aSelectedProviderKeys.length > 0
            );

            this._logInfo(
                "onProviderSelectionChange",
                "Selección de proveedores actualizada",
                {
                    selectedCount:
                        aSelectedProviderKeys.length,
                    selectedProviderKeys:
                        aSelectedProviderKeys,
                    selectAll:
                        !!oEvent.getParameter("selectAll")
                }
            );
        },

        onConfirmProviderSelection: function () {
            var oVM = this.getVM();

            var sRowPath =
                oVM.getProperty(
                    "/providerDialog/rowPath"
                );

            var aProviders =
                oVM.getProperty(
                    "/providerDialog/providers"
                ) || [];

            var aSelectedProviders =
                aProviders.filter(
                    function (oProvider) {
                        return oProvider.selected === true;
                    }
                );

            if (!sRowPath) {
                MessageBox.warning(
                    "No se pudo identificar la HU seleccionada."
                );
                return;
            }

            if (!aSelectedProviders.length) {
                MessageBox.warning(
                    "Seleccione al menos una combinaciÃ³n de proveedor y pedido antes de confirmar."
                );
                return;
            }

            var oRow = oVM.getProperty(sRowPath);

            this._applySelectedProvidersToRow(
                oRow,
                aSelectedProviders
            );

            oVM.setProperty(
                sRowPath,
                oRow
            );

            this._refreshPreviewDisplay();

            var aPreview =
                oVM.getProperty("/preview") || [];

            this._updateSummary(aPreview);
            this._evaluatePreviewBeforeCancel(aPreview);

            this._logInfo(
                "onConfirmProviderSelection",
                "Proveedores confirmados para la HU",
                {
                    rowPath: sRowPath,
                    huVenum: oRow.HuVenum || "",
                    huExidv: oRow.HuExidv || "",
                    selectedCount:
                        aSelectedProviders.length,
                    selectedProviders:
                        aSelectedProviders
                }
            );

            this.onCloseProviderDialog();

            MessageToast.show(
                aSelectedProviders.length === 1
                    ? "Pedido seleccionado correctamente."
                    : aSelectedProviders.length +
                        " pedidos seleccionados correctamente."
            );
        },

        onCloseProviderDialog: function () {
            if (this._oProviderDialog) {
                this._oProviderDialog.close();
            }
        },

        onAnularDocumento: function () {
            var oVM = this.getVM();
            var sMatDoc = oVM.getProperty("/matDoc");
            var bCanCancel = oVM.getProperty("/canCancel");
            var aPreview = oVM.getProperty("/preview") || [];
            var oSummary = oVM.getProperty("/summary") || {};

            if (oVM.getProperty("/busy")) {
                return;
            }

            if (!sMatDoc) {
                MessageBox.warning(
                    "Primero captura un documento material."
                );
                return;
            }

            if (oSummary.huPendientes > 0) {
                MessageBox.warning(
                    oSummary.huSelectionPending > 0
                        ? "Seleccione al menos una HU antes de anular."
                        : "Seleccione los pedidos de compra de cada HU elegida antes de anular."
                );
                return;
            }

            if (!bCanCancel) {
                MessageBox.warning(
                    "Primero consulta la vista previa antes de anular."
                );
                return;
            }

            var aHuSelections = this._annotateHuSelectionScope(
                aPreview,
                this._getHuSelections(aPreview)
            );
            var bAllHuSelected = this._isFullHuSelection(
                aPreview,
                aHuSelections
            );

            this._oPendingCancellation = {
                matDoc: sMatDoc,
                huSelections: aHuSelections,
                allHuSelected: bAllHuSelected
            };

            this.getVM().setProperty("/confirmationDialog", {
                matDoc: sMatDoc,
                total: oSummary.total || 0,
                hu: oSummary.hu || 0,
                material: oSummary.material || 0,
                otros: oSummary.otros || 0,
                selectionCount: aHuSelections.length,
                allHuSelected: bAllHuSelected,
                selections: aHuSelections
            });

            this._openCancellationConfirmation();
        },

        _openCancellationConfirmation: function () {
            if (!this._pCancellationConfirmationDialog) {
                this._pCancellationConfirmationDialog = Fragment.load({
                    id: this.getView().getId(),
                    name:
                        "z.anulacion.anulacion.fragment.CancellationConfirmation",
                    controller: this
                }).then(function (oDialog) {
                    this._oCancellationConfirmationDialog = oDialog;
                    this.getView().addDependent(oDialog);
                    return oDialog;
                }.bind(this));
            }

            this._pCancellationConfirmationDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        onCloseCancellationConfirmation: function () {
            if (this._oCancellationConfirmationDialog) {
                this._oCancellationConfirmationDialog.close();
            }

            this._oPendingCancellation = null;
        },

        onAfterCancellationConfirmationClose: function () {
            this._oPendingCancellation = null;
        },

        onConfirmCancellation: function () {
            var oPending = this._oPendingCancellation;
            var oVM = this.getVM();

            if (oVM.getProperty("/busy")) {
                return;
            }

            if (!oPending || !oPending.matDoc) {
                this.onCloseCancellationConfirmation();
                return;
            }

            if (this._oCancellationConfirmationDialog) {
                this._oCancellationConfirmationDialog.close();
            }

            // Bloqueo inmediato para impedir doble clic antes de iniciar
            // la primera llamada OData.
            oVM.setProperty("/busy", true);
            this._oPendingCancellation = null;

            if (oPending.allHuSelected) {
                this._postAllHuAnulacion(
                    oPending.matDoc,
                    oPending.huSelections || []
                );
                return;
            }

            this._postMultipleAnulaciones(
                oPending.matDoc,
                oPending.huSelections || []
            );
        },

        _getHuSelections: function (aPreview) {
            var aSelections = [];
            var mSeen = {};

            (aPreview || []).forEach(function (oRow) {
                if (!this._isHU(oRow)) {
                    return;
                }

                if (
                    oRow.HuSelectionRequired &&
                    !oRow.HuSelected
                ) {
                    return;
                }

                var aSelectedProviders =
                    Array.isArray(oRow.selectedProviders)
                        ? oRow.selectedProviders
                        : [];

                // Compatibilidad con la versión anterior.
                if (
                    !aSelectedProviders.length &&
                    oRow.selectedProvider
                ) {
                    aSelectedProviders = [
                        oRow.selectedProvider
                    ];
                }

                aSelectedProviders.forEach(function (oProvider) {
                    var oSelection = {
                        HuVenum:
                            oRow.HuVenum ||
                            oProvider.HuVenum ||
                            "",
                        HuExidv:
                            oRow.HuExidv ||
                            oProvider.HuExidv ||
                            "",
                        Lifnr:
                            oProvider.Lifnr || "",
                        Name1:
                            oProvider.Name1 || "",
                        Ebeln:
                            oProvider.Ebeln || "",
                        SeqNo: oProvider.SeqNo,
                        GrMatDoc: oProvider.GrMatDoc || "",
                        GrYear: oProvider.GrYear || "",
                        SoVbeln: oProvider.SoVbeln || "",
                        DelivVbeln: oProvider.DelivVbeln || "",
                        Charg: oProvider.Charg || "",
                        Menge: oProvider.Menge || "",
                        Meins: oProvider.Meins || "",
                        Matnr: oProvider.Matnr || "",
                        DisplayMatnr:
                            oProvider.DisplayMatnr ||
                            String(
                                oProvider.Matnr || ""
                            ).trim().slice(-10),
                        Maktx: oProvider.Maktx || ""
                    };

                    var sSelectionKey = [
                        oSelection.SeqNo === null ||
                        oSelection.SeqNo === undefined
                            ? ""
                            : String(oSelection.SeqNo),
                        oSelection.HuVenum,
                        oSelection.HuExidv,
                        oSelection.Lifnr,
                        oSelection.Ebeln
                    ].join("|");

                    if (!mSeen[sSelectionKey]) {
                        mSeen[sSelectionKey] = true;
                        aSelections.push(oSelection);
                    }
                });
            }.bind(this));

            this._logInfo(
                "_getHuSelections",
                "Selecciones HU/proveedor preparadas",
                {
                    total: aSelections.length,
                    selections: aSelections
                }
            );

            return aSelections;
        },

        _getEmptyCancellationSummary: function () {
            return {
                visible: false,
                document: "",
                huVenum: "",
                huExidv: "",
                providerText: "",
                purchaseOrderText: "",
                runId: ""
            };
        },

        _buildCancellationSummary: function (
            sMatDoc,
            aSelections,
            sRunId
        ) {
            var aItems = Array.isArray(aSelections)
                ? aSelections
                : [];
            var mProviders = {};
            var mPurchaseOrders = {};
            var mHuVenum = {};
            var mHuExidv = {};
            var aProviders = [];
            var aPurchaseOrders = [];
            var aHuVenum = [];
            var aHuExidv = [];

            aItems.forEach(function (oItem) {
                var sHuVenum = String(
                    oItem.HuVenum || ""
                ).trim();
                var sHuExidv = String(
                    oItem.HuExidv || ""
                ).trim();
                var sProviderNumber = String(
                    oItem.Lifnr || ""
                ).trim();
                var sProviderName = String(
                    oItem.Name1 || ""
                ).trim();
                var sProviderKey = sProviderNumber || sProviderName;
                var sPurchaseOrder = String(
                    oItem.Ebeln || ""
                ).trim();

                if (sHuVenum && !mHuVenum[sHuVenum]) {
                    mHuVenum[sHuVenum] = true;
                    aHuVenum.push(sHuVenum);
                }

                if (sHuExidv && !mHuExidv[sHuExidv]) {
                    mHuExidv[sHuExidv] = true;
                    aHuExidv.push(sHuExidv);
                }

                if (sProviderKey && !mProviders[sProviderKey]) {
                    mProviders[sProviderKey] = true;
                    aProviders.push(
                        [sProviderNumber, sProviderName]
                            .filter(Boolean)
                            .join(" - ")
                    );
                }

                if (
                    sPurchaseOrder &&
                    !mPurchaseOrders[sPurchaseOrder]
                ) {
                    mPurchaseOrders[sPurchaseOrder] = true;
                    aPurchaseOrders.push(sPurchaseOrder);
                }
            });

            return {
                visible: true,
                document: String(sMatDoc || "").trim(),
                huVenum: aHuVenum.join(" | "),
                huExidv: aHuExidv.join(" | "),
                providerText: aProviders.join(" | "),
                purchaseOrderText: aPurchaseOrders.join(" | "),
                runId: String(sRunId || "").trim()
            };
        },

        _groupHuSelections: function (aSelections) {
            var mGroups = {};
            var aGroups = [];

            (aSelections || []).forEach(function (oSelection) {
                var sHuVenum = String(
                    oSelection.HuVenum || ""
                ).trim();
                var sHuExidv = String(
                    oSelection.HuExidv || ""
                ).trim();
                var sGroupKey = [sHuVenum, sHuExidv].join("|");

                if (!mGroups[sGroupKey]) {
                    mGroups[sGroupKey] = {
                        HuVenum: sHuVenum,
                        HuExidv: sHuExidv,
                        selections: []
                    };
                    aGroups.push(mGroups[sGroupKey]);
                }

                mGroups[sGroupKey].selections.push(oSelection);
            });

            return aGroups;
        },

        _annotateHuSelectionScope: function (aPreview, aSelections) {
            return (aSelections || []).map(function (oSelection) {
                var sSelectionExidv = String(
                    oSelection.HuExidv || ""
                ).trim();
                var sSelectionVenum = String(
                    oSelection.HuVenum || ""
                ).trim();
                var oRow = (aPreview || []).find(function (oPreviewRow) {
                    if (!this._isHU(oPreviewRow)) {
                        return false;
                    }

                    var sRowExidv = String(
                        oPreviewRow.HuExidv || ""
                    ).trim();
                    var sRowVenum = String(
                        oPreviewRow.HuVenum || ""
                    ).trim();

                    return sSelectionExidv
                        ? sRowExidv === sSelectionExidv
                        : sRowVenum === sSelectionVenum;
                }.bind(this));
                var iAvailableOrders = oRow && Array.isArray(
                    oRow.providerOptions
                )
                    ? oRow.providerOptions.length
                    : 0;
                var iSelectedOrders = oRow && Array.isArray(
                    oRow.selectedProviders
                )
                    ? oRow.selectedProviders.length
                    : 0;

                return Object.assign({}, oSelection, {
                    AllHuOrdersSelected:
                        iAvailableOrders > 0 &&
                        iSelectedOrders === iAvailableOrders
                });
            }.bind(this));
        },

        _isFullHuSelection: function (aPreview, aSelections) {
            var aAvailableHu = (aPreview || []).filter(function (oRow) {
                return this._isHU(oRow);
            }.bind(this));
            var aSelectedGroups = this._groupHuSelections(
                aSelections || []
            );
            var mSelectedHu = {};

            aSelectedGroups.forEach(function (oGroup) {
                mSelectedHu[
                    [oGroup.HuVenum, oGroup.HuExidv].join("|")
                ] = true;
            });

            // Una sola HU siempre usa el POST individual con sus
            // identificadores. El modo global aplica únicamente cuando
            // existen varias HU, todas fueron seleccionadas y no se quitó
            // ningún pedido de una HU.
            return aAvailableHu.length > 1 &&
                aSelectedGroups.length === aAvailableHu.length &&
                aAvailableHu.every(function (oRow) {
                    var sKey = [
                        String(oRow.HuVenum || "").trim(),
                        String(oRow.HuExidv || "").trim()
                    ].join("|");
                    var iAvailableOrders = (
                        oRow.providerOptions || []
                    ).length;
                    var iSelectedOrders = (
                        oRow.selectedProviders || []
                    ).length;

                    return !!mSelectedHu[sKey] &&
                        iAvailableOrders > 0 &&
                        iSelectedOrders === iAvailableOrders;
                });
        },

        _normalizeHuIdentifier: function (sValue) {
            var sNormalized = String(sValue || "").trim();

            return sNormalized
                ? (sNormalized.replace(/^0+/, "") || "0")
                : "";
        },

        _findLiveHuRow: function (oTargetGroup, aPreview) {
            var sTargetExidv = String(
                oTargetGroup && oTargetGroup.HuExidv || ""
            ).trim();
            var sTargetVenum = String(
                oTargetGroup && oTargetGroup.HuVenum || ""
            ).trim();
            var sNormalizedExidv = this._normalizeHuIdentifier(
                sTargetExidv
            );
            var sNormalizedVenum = this._normalizeHuIdentifier(
                sTargetVenum
            );
            var aHuRows = (aPreview || []).filter(function (oRow) {
                return this._isHU(oRow);
            }.bind(this));
            var oLiveRow = aHuRows.find(function (oRow) {
                return sNormalizedExidv &&
                    this._normalizeHuIdentifier(oRow.HuExidv) ===
                        sNormalizedExidv;
            }.bind(this));

            if (oLiveRow) {
                return oLiveRow;
            }

            return aHuRows.find(function (oRow) {
                return sNormalizedVenum &&
                    this._normalizeHuIdentifier(oRow.HuVenum) ===
                        sNormalizedVenum;
            }.bind(this));
        },

        _getLiveHuSelections: function (oTargetGroup, aPreview) {
            var oLiveRow = this._findLiveHuRow(
                oTargetGroup,
                aPreview
            );

            if (!oLiveRow) {
                return [];
            }

            var mRequestedPairs = {};
            var bAllOrdersOriginallySelected =
                (oTargetGroup.selections || []).length > 0 &&
                (oTargetGroup.selections || []).every(
                    function (oSelection) {
                        return oSelection.AllHuOrdersSelected === true;
                    }
                );

            (oTargetGroup.selections || []).forEach(function (oSelection) {
                var sOrder = String(oSelection.Ebeln || "").trim();
                var sProvider = String(oSelection.Lifnr || "").trim();

                if (sOrder || sProvider) {
                    mRequestedPairs[
                        [sProvider, sOrder].join("|")
                    ] = true;
                }
            });

            var aLiveProviders = (oLiveRow.providerOptions || []);

            if (!bAllOrdersOriginallySelected) {
                aLiveProviders = aLiveProviders.filter(
                    function (oProvider) {
                        var sPairKey = [
                            String(oProvider.Lifnr || "").trim(),
                            String(oProvider.Ebeln || "").trim()
                        ].join("|");

                        return !!mRequestedPairs[sPairKey];
                    }
                );
            }

            if (!aLiveProviders.length) {
                return [];
            }

            if (
                !bAllOrdersOriginallySelected &&
                Object.keys(mRequestedPairs).some(function (sPairKey) {
                    return !aLiveProviders.some(function (oProvider) {
                        return [
                            String(oProvider.Lifnr || "").trim(),
                            String(oProvider.Ebeln || "").trim()
                        ].join("|") === sPairKey;
                    });
                })
            ) {
                return [];
            }

            var oSelectableRow = Object.assign({}, oLiveRow, {
                HuSelected: true,
                HuSelectionRequired: false,
                selectedProviders: aLiveProviders,
                selectedProvider: aLiveProviders[0]
            });

            return this._getHuSelections([oSelectableRow]);
        },

        _getAllLiveHuSelections: function (aPreview) {
            return (aPreview || []).reduce(function (
                aSelections,
                oRow
            ) {
                if (!this._isHU(oRow)) {
                    return aSelections;
                }

                var aLiveProviders = oRow.providerOptions || [];
                var oSelectableRow = Object.assign({}, oRow, {
                    HuSelected: true,
                    HuSelectionRequired: false,
                    selectedProviders: aLiveProviders,
                    selectedProvider: aLiveProviders[0]
                });

                return aSelections.concat(
                    this._getHuSelections([oSelectableRow])
                );
            }.bind(this), []);
        },

        _buildAnulacionPayload: function (
            sMatDoc,
            aSelections,
            bOmitHuIdentifiers
        ) {
            var aItems = Array.isArray(aSelections)
                ? aSelections
                : [];
            var mSeenPairs = {};
            var aPayloadItems = bOmitHuIdentifiers
                ? aItems.filter(function (oItem) {
                    var sPairKey = [
                        String(oItem.Lifnr || "").trim(),
                        String(oItem.Ebeln || "").trim()
                    ].join("|");

                    if (mSeenPairs[sPairKey]) {
                        return false;
                    }

                    mSeenPairs[sPairKey] = true;
                    return true;
                })
                : aItems;
            var oFirstItem = aPayloadItems[0] || {};
            var sEbelnsSel = aPayloadItems
                .map(function (oItem) {
                    return String(oItem.Ebeln || "").trim();
                })
                .filter(Boolean)
                .join(";");
            var oPayload = {
                MatDoc: sMatDoc,
                ProveedoresSel: aPayloadItems
                    .map(function (oItem) {
                        return String(oItem.Lifnr || "").trim();
                    })
                    .filter(Boolean)
                    .join(";"),
                EbelnSel: sEbelnsSel,
                EbelnsSel: sEbelnsSel
            };

            if (!bOmitHuIdentifiers) {
                oPayload.HuVenum = String(
                    oFirstItem.HuVenum || ""
                ).trim();
                oPayload.HuExidv = String(
                    oFirstItem.HuExidv || ""
                ).trim();
            }

            return oPayload;
        },

        _formatHuAnulacionResult: function (oResult) {
            var oGroup = oResult && oResult.group
                ? oResult.group
                : {};
            var aSelections = Array.isArray(oGroup.selections)
                ? oGroup.selections
                : [];
            var mPurchaseOrders = {};
            var aPurchaseOrders = [];

            aSelections.forEach(function (oSelection) {
                var sPurchaseOrder = String(
                    oSelection.Ebeln || ""
                ).trim();

                if (
                    sPurchaseOrder &&
                    !mPurchaseOrders[sPurchaseOrder]
                ) {
                    mPurchaseOrders[sPurchaseOrder] = true;
                    aPurchaseOrders.push(sPurchaseOrder);
                }
            });

            return "• Identificador: " +
                (String(oGroup.HuExidv || "").trim() || "-") +
                " · Número interno: " +
                (String(oGroup.HuVenum || "").trim() || "-") +
                " · Pedido(s): " +
                (aPurchaseOrders.join(", ") || "Sin pedido");
        },

        _getAnulacionResultErrorMessage: function (oResult) {
            var oError = oResult && oResult.error
                ? oResult.error
                : {};
            var sMessage = String(
                oError.message || ""
            ).trim();
            var sHttpStatus = [
                oError.statusCode,
                oError.statusText
            ].filter(Boolean).join(" ");

            try {
                if (oError.responseText) {
                    var oResponse = JSON.parse(oError.responseText);
                    var oResponseError = oResponse && oResponse.error;
                    var oResponseMessage = oResponseError &&
                        oResponseError.message;
                    var aErrorDetails = oResponseError &&
                        oResponseError.innererror &&
                        oResponseError.innererror.errordetails;
                    var sSapMessage = oResponseMessage &&
                        (oResponseMessage.value || oResponseMessage);

                    if (!sSapMessage && Array.isArray(aErrorDetails)) {
                        var oDetail = aErrorDetails.find(function (
                            oErrorDetail
                        ) {
                            return oErrorDetail &&
                                oErrorDetail.message;
                        });
                        sSapMessage = oDetail && oDetail.message;
                    }

                    if (sSapMessage) {
                        sMessage = String(sSapMessage).trim();
                    }
                }
            } catch (oParseError) {
                // Se conserva el mensaje disponible en el error original.
                if (!(oParseError instanceof SyntaxError)) {
                    throw oParseError;
                }
            }

            if (sHttpStatus && sMessage.indexOf(sHttpStatus) === -1) {
                sMessage = (sMessage || "Falló la solicitud OData") +
                    " (HTTP " + sHttpStatus + ")";
            }

            return sMessage || "SAP no devolvió el motivo.";
        },

        _buildMultipleAnulacionResultMessage: function (
            sSummary,
            aSuccessResults,
            aErrorResults
        ) {
            var aSections = [sSummary];

            if (aSuccessResults.length) {
                aSections.push(
                    (aSuccessResults.length === 1
                        ? "HU anulada:\n"
                        : "HU anuladas:\n") +
                    aSuccessResults.map(function (oResult) {
                        return this._formatHuAnulacionResult(oResult);
                    }.bind(this)).join("\n")
                );
            }

            if (aErrorResults.length) {
                aSections.push(
                    (aErrorResults.length === 1
                        ? "HU no anulada:\n"
                        : "HU no anuladas:\n") +
                    aErrorResults.map(function (oResult) {
                        return this._formatHuAnulacionResult(oResult) +
                            "\n  Motivo: " +
                            this._getAnulacionResultErrorMessage(oResult);
                    }.bind(this)).join("\n")
                );
            }

            return aSections.join("\n\n");
        },

        _postAllHuAnulacion: function (sMatDoc, aSelections) {
            var aGroups = this._groupHuSelections(aSelections);
            var oOriginalGroup = {
                HuVenum: aGroups.map(function (oGroup) {
                    return oGroup.HuVenum;
                }).filter(Boolean).join(" | "),
                HuExidv: aGroups.map(function (oGroup) {
                    return oGroup.HuExidv;
                }).filter(Boolean).join(" | "),
                selections: aSelections
            };

            this.getVM().setProperty("/busy", true);
            this.getVM().setProperty("/detalle", []);
            this.getVM().setProperty(
                "/cancellationSummary",
                this._getEmptyCancellationSummary()
            );

            this._logInfo(
                "ANULACION_TOTAL.REFRESH",
                "Refrescando el MatDoc antes del POST global",
                {
                    MatDoc: sMatDoc,
                    totalHuOriginal: aGroups.length
                }
            );

            this._refreshPreviewAfterCancellation(
                sMatDoc,
                function (bPreviewUpdated, oRefreshResult) {
                    if (!bPreviewUpdated) {
                        this._finalizeMultipleAnulaciones(
                            sMatDoc,
                            [{
                                success: false,
                                error: {
                                    message:
                                        "No fue posible refrescar el MatDoc antes de la anulación total."
                                },
                                group: oOriginalGroup,
                                huCount: aGroups.length
                            }]
                        );
                        return;
                    }

                    var aLiveSelections =
                        this._getAllLiveHuSelections(
                            oRefreshResult.preview || []
                        );
                    var aLiveGroups = this._groupHuSelections(
                        aLiveSelections
                    );
                    var oLiveGroup = {
                        HuVenum: aLiveGroups.map(function (oGroup) {
                            return oGroup.HuVenum;
                        }).filter(Boolean).join(" | "),
                        HuExidv: aLiveGroups.map(function (oGroup) {
                            return oGroup.HuExidv;
                        }).filter(Boolean).join(" | "),
                        selections: aLiveSelections
                    };

                    if (!aLiveSelections.length) {
                        this._finalizeMultipleAnulaciones(
                            sMatDoc,
                            [{
                                success: false,
                                error: {
                                    message:
                                        "El preview actualizado no contiene HU disponibles para anular."
                                },
                                group: oOriginalGroup,
                                huCount: aGroups.length
                            }]
                        );
                        return;
                    }

                    this._logInfo(
                        "ANULACION_TOTAL.ENVIO",
                        "Todas las HU están seleccionadas; se enviará un solo POST sin identificadores HU",
                        {
                            MatDoc: sMatDoc,
                            totalHu: aLiveGroups.length,
                            payload: this._buildAnulacionPayload(
                                sMatDoc,
                                aLiveSelections,
                                true
                            )
                        }
                    );

                    this._postAnulacion(
                        sMatDoc,
                        aLiveSelections,
                        {
                            isBatchItem: true,
                            omitHuIdentifiers: true,
                            onComplete: function (oResult) {
                                var oFinalResult = Object.assign(
                                    {},
                                    oResult,
                                    {
                                        group: oLiveGroup,
                                        huCount: aLiveGroups.length
                                    }
                                );

                                this._logInfo(
                                    "ANULACION_TOTAL.RESPUESTA",
                                    "Respuesta final del POST global",
                                    {
                                        MatDoc: sMatDoc,
                                        totalHu: aLiveGroups.length,
                                        response:
                                            oResult.data || oResult.error
                                    }
                                );

                                if (oResult.success !== true) {
                                    this._finalizeMultipleAnulaciones(
                                        sMatDoc,
                                        [oFinalResult]
                                    );
                                    return;
                                }

                                this._waitForSapRelease(function () {
                                    this._finalizeMultipleAnulaciones(
                                        sMatDoc,
                                        [oFinalResult]
                                    );
                                }.bind(this));
                            }.bind(this)
                        }
                    );
                }.bind(this)
            );
        },

        _postMultipleAnulaciones: function (sMatDoc, aSelections) {
            var aGroups = this._groupHuSelections(aSelections);
            var aResults = [];
            var iCurrentGroup = 0;
            var sSequentialTraceId = this._generateTraceId(
                "ANULACION_SECUENCIAL"
            );

            this._logInfo(
                "ANULACION_SECUENCIAL.INICIO",
                "Inicia la cola: " + aGroups.length +
                    " HU se enviarán una por una",
                {
                    traceId: sSequentialTraceId,
                    matDoc: sMatDoc,
                    totalHu: aGroups.length,
                    huQueue: aGroups.map(function (oGroup) {
                        return {
                            HuVenum: oGroup.HuVenum,
                            HuExidv: oGroup.HuExidv
                        };
                    })
                }
            );

            this.getVM().setProperty("/busy", true);
            this.getVM().setProperty("/detalle", []);
            this.getVM().setProperty(
                "/cancellationSummary",
                this._getEmptyCancellationSummary()
            );

            var fnAddPendingResults = function (
                iStartIndex,
                sMessage
            ) {
                aGroups.slice(iStartIndex).forEach(function (
                    oPendingGroup
                ) {
                    aResults.push({
                        success: false,
                        skipped: true,
                        error: { message: sMessage },
                        group: oPendingGroup
                    });
                });
            };

            var fnPostNextGroup = function () {
                if (iCurrentGroup >= aGroups.length) {
                    this._logInfo(
                        "ANULACION_SECUENCIAL.FIN",
                        "Finalizó la cola; no quedan HU por enviar",
                        {
                            traceId: sSequentialTraceId,
                            matDoc: sMatDoc,
                            totalHu: aGroups.length,
                            results: aResults
                        }
                    );
                    this._finalizeMultipleAnulaciones(
                        sMatDoc,
                        aResults
                    );
                    return;
                }

                var oTargetGroup = aGroups[iCurrentGroup];
                var iPosition = iCurrentGroup + 1;

                this._logInfo(
                    "ANULACION_SECUENCIAL.REFRESH",
                    "Consultando el MatDoc antes de reconstruir la HU viva",
                    {
                        traceId: sSequentialTraceId,
                        MatDoc: sMatDoc,
                        position: iPosition,
                        totalHu: aGroups.length,
                        HuVenumOriginal: oTargetGroup.HuVenum,
                        HuExidvOriginal: oTargetGroup.HuExidv
                    }
                );

                this._refreshPreviewAfterCancellation(
                    sMatDoc,
                    function (bPreviewUpdated, oRefreshResult) {
                        if (!bPreviewUpdated) {
                            aResults.push({
                                success: false,
                                error: {
                                    message:
                                        "No fue posible refrescar el MatDoc antes de procesar la HU."
                                },
                                group: oTargetGroup
                            });
                            fnAddPendingResults(
                                iCurrentGroup + 1,
                                "No se envió porque falló el refresco del MatDoc."
                            );
                            this._finalizeMultipleAnulaciones(
                                sMatDoc,
                                aResults
                            );
                            return;
                        }

                        var aLivePreview =
                            oRefreshResult.preview || [];
                        var oLiveRow = this._findLiveHuRow(
                            oTargetGroup,
                            aLivePreview
                        );

                        if (!oLiveRow) {
                            this._logInfo(
                                "ANULACION_SECUENCIAL.HU_YA_ANULADA",
                                "La HU ya no existe en el preview actualizado; se continúa con la siguiente",
                                {
                                    traceId: sSequentialTraceId,
                                    position: iPosition,
                                    HuVenum: oTargetGroup.HuVenum,
                                    HuExidv: oTargetGroup.HuExidv
                                }
                            );
                            aResults.push({
                                success: true,
                                alreadyRemoved: true,
                                data: {
                                    Status: "W",
                                    Message:
                                        "La HU ya no aparece en el preview actualizado."
                                },
                                group: oTargetGroup
                            });
                            iCurrentGroup++;
                            fnPostNextGroup();
                            return;
                        }

                        var aLiveSelections =
                            this._getLiveHuSelections(
                                oTargetGroup,
                                aLivePreview
                            );

                        if (!aLiveSelections.length) {
                            aResults.push({
                                success: false,
                                error: {
                                    message:
                                        "La HU existe, pero sus pedidos o proveedor seleccionados ya no pudieron reconstruirse con datos actuales."
                                },
                                group: oTargetGroup
                            });
                            fnAddPendingResults(
                                iCurrentGroup + 1,
                                "No se envió porque no fue posible reconstruir la HU anterior."
                            );
                            this._finalizeMultipleAnulaciones(
                                sMatDoc,
                                aResults
                            );
                            return;
                        }

                        var oGroup = Object.assign(
                            {},
                            oTargetGroup,
                            {
                                HuVenum:
                                    aLiveSelections[0].HuVenum || "",
                                HuExidv:
                                    aLiveSelections[0].HuExidv || "",
                                selections: aLiveSelections
                            }
                        );

                        this._logInfo(
                            "ANULACION_SECUENCIAL.ENVIO",
                            "Enviando HU " + iPosition +
                                " de " + aGroups.length,
                            {
                                traceId: sSequentialTraceId,
                                position: iPosition,
                                totalHu: aGroups.length,
                                MatDoc: sMatDoc,
                                HuVenum: oGroup.HuVenum,
                                HuExidv: oGroup.HuExidv,
                                payload: this._buildAnulacionPayload(
                                    sMatDoc,
                                    oGroup.selections
                                )
                            }
                        );

                        this._postAnulacion(
                            sMatDoc,
                            oGroup.selections,
                            {
                                isBatchItem: true,
                                onComplete: function (oResult) {
                                    var sResponseStatus = String(
                                        oResult.data &&
                                        oResult.data.Status
                                            ? oResult.data.Status
                                            : (oResult.success === true
                                                ? "S"
                                                : "E")
                                    ).toUpperCase();

                                    aResults.push(Object.assign(
                                        {},
                                        oResult,
                                        { group: oGroup }
                                    ));
                                    iCurrentGroup++;

                                    this._logInfo(
                                        "ANULACION_SECUENCIAL.RESPUESTA",
                                        "Respuesta final de HU " +
                                            iPosition + " de " +
                                            aGroups.length + ": " +
                                            sResponseStatus,
                                        {
                                            traceId:
                                                sSequentialTraceId,
                                            position: iPosition,
                                            HuVenum: oGroup.HuVenum,
                                            HuExidv: oGroup.HuExidv,
                                            Status: sResponseStatus,
                                            Message: oResult.data &&
                                                oResult.data.Message ||
                                                this._getAnulacionResultErrorMessage(
                                                    oResult
                                                )
                                        }
                                    );

                                    if (oResult.success !== true) {
                                        this._logError(
                                            "ANULACION_SECUENCIAL.DETENIDA",
                                            "La cola se detuvo; no se enviarán las HU restantes",
                                            {
                                                traceId:
                                                    sSequentialTraceId,
                                                HuVenum: oGroup.HuVenum,
                                                HuExidv: oGroup.HuExidv,
                                                Status: sResponseStatus,
                                                pendingHu:
                                                    aGroups.length -
                                                    iCurrentGroup
                                            }
                                        );
                                        fnAddPendingResults(
                                            iCurrentGroup,
                                            "No se envió porque una HU anterior regresó error."
                                        );
                                        this._finalizeMultipleAnulaciones(
                                            sMatDoc,
                                            aResults
                                        );
                                        return;
                                    }

                                    this._logInfo(
                                        "ANULACION_SECUENCIAL.ESPERA",
                                        "Respuesta aceptada; esperando 2000 ms antes de continuar",
                                        {
                                            traceId:
                                                sSequentialTraceId,
                                            completedHu:
                                                iCurrentGroup,
                                            pendingHu:
                                                aGroups.length -
                                                iCurrentGroup
                                        }
                                    );
                                    this._waitForSapRelease(
                                        fnPostNextGroup
                                    );
                                }.bind(this)
                            }
                        );
                    }.bind(this)
                );
            }.bind(this);

            fnPostNextGroup();
        },

        _waitForSapRelease: function (fnContinue) {
            setTimeout(fnContinue, 2000);
        },

        _refreshPreviewAfterCancellation: function (
            sMatDoc,
            fnComplete
        ) {
            var oModel = this.getModel();
            var oVM = this.getVM();
            var sTraceId = this._generateTraceId(
                "PREVIEW_AFTER_ANULACION"
            );

            oModel.read("/AnulacionPreviewHeaderSet", {
                filters: [
                    new Filter(
                        "MatDoc",
                        FilterOperator.EQ,
                        sMatDoc
                    )
                ],
                urlParameters: {
                    "sap-client": "300",
                    "$expand": "ToItems"
                },
                success: function (oData) {
                    var oHeader = this._getDeepPreviewHeader(oData);
                    var aItems = this._getDeepPreviewItems(oHeader);
                    var aGroupedRows = [];
                    var bValidPreview = !!oHeader &&
                        String(oHeader.Status || "")
                            .toUpperCase() !== "E";

                    if (
                        bValidPreview &&
                        aItems.length
                    ) {
                        aGroupedRows = this._buildPreviewRows(
                            this._mapDeepPreviewItems(oHeader, aItems)
                        );
                    }

                    oVM.setProperty("/previewHeader", oHeader || {});
                    oVM.setProperty("/previewItems", aItems);
                    oVM.setProperty("/preview", aGroupedRows);
                    this._refreshPreviewDisplay();
                    this._updateSummary(aGroupedRows);
                    oVM.setProperty("/canCancel", false);

                    this._logInfo(
                        "_refreshPreviewAfterCancellation.success",
                        "Vista previa actualizada después de la anulación",
                        {
                            traceId: sTraceId,
                            matDoc: sMatDoc,
                            huCount:
                                oVM.getProperty("/summary/hu") || 0
                        }
                    );

                    if (typeof fnComplete === "function") {
                        fnComplete(bValidPreview, {
                            header: oHeader,
                            items: aItems,
                            preview: aGroupedRows
                        });
                    }
                }.bind(this),
                error: function (oError) {
                    this._logError(
                        "_refreshPreviewAfterCancellation.error",
                        "No fue posible actualizar la vista previa",
                        {
                            traceId: sTraceId,
                            matDoc: sMatDoc,
                            error: this._serializeError(oError)
                        }
                    );

                    if (typeof fnComplete === "function") {
                        fnComplete(false, oError);
                    }
                }.bind(this)
            });
        },

        _finalizeMultipleAnulaciones: function (
            sMatDoc,
            aResults,
            oFinalizeOptions
        ) {
            var oOptions = oFinalizeOptions || {};
            var aSuccessResults = (aResults || []).filter(
                function (oResult) {
                    return oResult.success === true;
                }
            );
            var aErrorResults = (aResults || []).filter(
                function (oResult) {
                    return oResult.success !== true;
                }
            );
            var aSuccessfulSelections = [];
            var aRunIds = [];
            var iSuccessfulHu = aSuccessResults.reduce(
                function (iTotal, oResult) {
                    return iTotal + Number(oResult.huCount || 1);
                },
                0
            );
            var iErrorHu = aErrorResults.reduce(
                function (iTotal, oResult) {
                    return iTotal + Number(oResult.huCount || 1);
                },
                0
            );
            var iTotalHu = iSuccessfulHu + iErrorHu;

            aSuccessResults.forEach(function (oResult) {
                aSuccessfulSelections = aSuccessfulSelections.concat(
                    oResult.group.selections || []
                );

                if (oResult.data && oResult.data.RunId) {
                    aRunIds.push(oResult.data.RunId);
                }
            });

            var sStatus = aErrorResults.length
                ? (aSuccessResults.length ? "W" : "E")
                : "S";
            var sMessage = aErrorResults.length
                ? iSuccessfulHu + " de " +
                    iTotalHu +
                    " HU se anularon correctamente."
                : iSuccessfulHu +
                    " HU se anularon correctamente.";
            var sDetailedMessage =
                this._buildMultipleAnulacionResultMessage(
                    sMessage,
                    aSuccessResults,
                    aErrorResults
                );

            this.getVM().setProperty("/resultado", {
                Status: sStatus,
                Message: sMessage
            });
            this.getVM().setProperty(
                "/resultadoState",
                this._getState(sStatus)
            );
            this.getVM().setProperty("/canCancel", false);
            this.getVM().setProperty(
                "/lastRunId",
                aRunIds.join(";")
            );
            this.getVM().setProperty(
                "/cancellationSummary",
                aSuccessResults.length
                    ? this._buildCancellationSummary(
                        sMatDoc,
                        aSuccessfulSelections,
                        aRunIds.join(" | ")
                    )
                    : this._getEmptyCancellationSummary()
            );
            this.getVM().setProperty("/selectedSection", "detail");

            var fnCompleteFinalization = function (bPreviewUpdated) {
                    if (!bPreviewUpdated) {
                        MessageToast.show(
                            "La anulación terminó, pero no fue posible refrescar la vista previa."
                        );
                    }

                    if (!aSuccessResults.length) {
                        this.getVM().setProperty("/busy", false);
                        MessageBox.error(sDetailedMessage, {
                            title: "Resultado de anulación"
                        });
                        return;
                    }

                    if (aErrorResults.length) {
                        MessageBox.warning(sDetailedMessage, {
                            title: "Resultado de anulación"
                        });
                    } else {
                        MessageToast.show(sMessage);
                    }

                    this._getDetalleFinalByMatDoc(sMatDoc);
                }.bind(this);

            if (oOptions.previewAlreadyRefreshed) {
                fnCompleteFinalization(true);
                return;
            }

            this._refreshPreviewAfterCancellation(
                sMatDoc,
                fnCompleteFinalization
            );
        },

        _postAnulacion: function (
            sMatDoc,
            aHuSelections,
            oExecutionOptions
        ) {
            var oModel = this.getModel();
            var sTraceId =
                this._generateTraceId("POST_ANULACION");
            var sPath = "/AnulacionSet";
            var aSelections = Array.isArray(aHuSelections)
                ? aHuSelections
                : [];
            var oOptions = oExecutionOptions || {};
            var bOmitHuIdentifiers =
                oOptions.omitHuIdentifiers === true;

            // =========================================================
            // VALIDAR SELECCIONES
            // =========================================================

            if (!aSelections.length) {
                var sEmptySelectionMessage =
                    "No se encontraron proveedores seleccionados para la HU.";

                if (typeof oOptions.onComplete === "function") {
                    oOptions.onComplete({
                        success: false,
                        error: { message: sEmptySelectionMessage },
                        selections: aSelections
                    });
                } else {
                    MessageBox.warning(sEmptySelectionMessage);
                }
                return;
            }

            // El payload de AnulacionSet recibe una sola HU por solicitud.
            // Validamos que todas las selecciones correspondan a la misma HU.
            var sHuVenum = bOmitHuIdentifiers
                ? ""
                : aSelections[0].HuVenum || "";
            var sHuExidv = bOmitHuIdentifiers
                ? ""
                : aSelections[0].HuExidv || "";

            if (
                !bOmitHuIdentifiers &&
                (!sHuVenum || !sHuExidv)
            ) {
                var sHuValidationMessage =
                    "La llamada individual requiere HuVenum y HuExidv.";

                if (typeof oOptions.onComplete === "function") {
                    oOptions.onComplete({
                        success: false,
                        error: { message: sHuValidationMessage },
                        selections: aSelections
                    });
                } else {
                    MessageBox.warning(sHuValidationMessage);
                }
                return;
            }

            var bDifferentHu = aSelections.some(function (oItem) {
                return (
                    (oItem.HuVenum || "") !== sHuVenum ||
                    (oItem.HuExidv || "") !== sHuExidv
                );
            });

            if (bDifferentHu && !bOmitHuIdentifiers) {
                this._postMultipleAnulaciones(
                    sMatDoc,
                    aSelections
                );
                return;
            }

            // =========================================================
            // CONCATENAR PROVEEDORES Y PEDIDOS CON ;
            // =========================================================

            var sProveedoresSel = aSelections
                .map(function (oItem) {
                    return String(oItem.Lifnr || "").trim();
                })
                .filter(function (sValue) {
                    return !!sValue;
                })
                .join(";");

            var sEbelnsSel = aSelections
                .map(function (oItem) {
                    return String(oItem.Ebeln || "").trim();
                })
                .filter(function (sValue) {
                    return !!sValue;
                })
                .join(";");

            if (!sProveedoresSel) {
                var sProviderValidationMessage =
                    "No se encontraron números de proveedor para enviar a la anulación.";

                if (typeof oOptions.onComplete === "function") {
                    oOptions.onComplete({
                        success: false,
                        error: { message: sProviderValidationMessage },
                        selections: aSelections
                    });
                } else {
                    MessageBox.warning(sProviderValidationMessage);
                }
                return;
            }

            if (!sEbelnsSel) {
                var sOrderValidationMessage =
                    "No se encontraron pedidos de compra para enviar a la anulación.";

                if (typeof oOptions.onComplete === "function") {
                    oOptions.onComplete({
                        success: false,
                        error: { message: sOrderValidationMessage },
                        selections: aSelections
                    });
                } else {
                    MessageBox.warning(sOrderValidationMessage);
                }
                return;
            }

            // =========================================================
            // PAYLOAD FINAL PARA SAP
            // Ejemplo:
            // {
            //   MatDoc: "5000560246",
            //   HuVenum: "0001522998",
            //   HuExidv: "00000000000403033005",
            //   ProveedoresSel: "0050001112;0050001177",
            //   EbelnsSel: "4700090510;4700090512"
            // }
            // =========================================================

            var oPayload = this._buildAnulacionPayload(
                sMatDoc,
                aSelections,
                bOmitHuIdentifiers
            );

            // =========================================================
            // LOG COMPLETO DEL POST Y DEL JSON QUE SE ENVIARÁ A SAP
            // =========================================================

            var sServiceUrl =
                oModel && oModel.sServiceUrl
                    ? oModel.sServiceUrl
                    : "/sap/opu/odata/sap/ZGP_ANULACION_SRV/";

            var sPostUri =
                sServiceUrl.replace(/\/$/, "") +
                "/AnulacionSet";

            console.group(
                "========== JSON ENVIADO A SAP =========="
            );

            console.log("MÉTODO:");
            console.log("POST");

            console.log("URI ODATA:");
            console.log(sPostUri);

            console.log("DOCUMENTO MATERIAL:");
            console.log(sMatDoc);

            console.log("HU VENUM:");
            console.log(sHuVenum);

            console.log("HU EXIDV:");
            console.log(sHuExidv);

            console.log("CANTIDAD DE PROVEEDORES:");
            console.log(aSelections.length);

            console.log("PROVEEDORES CONCATENADOS:");
            console.log(sProveedoresSel);

            console.log("PEDIDOS CONCATENADOS:");
            console.log(sEbelnsSel);

            console.log("SELECCIONES ORIGINALES:");
            console.table(aSelections);

            console.log("OBJETO PAYLOAD:");
            console.log(oPayload);

            console.log("JSON EXACTO ENVIADO:");
            console.log(
                JSON.stringify(
                    oPayload,
                    null,
                    2
                )
            );

            console.groupEnd();

            console.log(
                "[POST ANULACION][JSON]",
                JSON.stringify(oPayload, null, 2)
            );

            this._logInfo(
                "_postAnulacion",
                "Inicia solicitud de anulación",
                {
                    traceId: sTraceId,
                    path: sPath,
                    payload: oPayload,
                    huSelections: aSelections
                }
            );

            if (!oOptions.isBatchItem) {
                this.getVM().setProperty(
                    "/busy",
                    true
                );

                this.getVM().setProperty(
                    "/detalle",
                    []
                );
                this.getVM().setProperty(
                    "/cancellationSummary",
                    this._getEmptyCancellationSummary()
                );
            }

            // =========================================================
            // ENVÍO A SAP
            // =========================================================

            oModel.create(
                sPath,
                oPayload,
                {
                    success: function (oData) {
                        console.group(
                            "========== RESPUESTA ANULACION SAP =========="
                        );

                        console.log("MÉTODO:");
                        console.log("POST");

                        console.log("URI ODATA:");
                        console.log(sPostUri);

                        console.log("JSON QUE SE ENVIÓ:");
                        console.log(
                            JSON.stringify(
                                oPayload,
                                null,
                                2
                            )
                        );

                        console.log("RESPUESTA COMPLETA SAP:");
                        console.log(oData);

                        console.log("RESPUESTA SAP EN JSON:");
                        try {
                            console.log(
                                JSON.stringify(
                                    oData,
                                    null,
                                    2
                                )
                            );
                        } catch (oResponseJsonError) {
                            console.log(oData);
                        }

                        console.groupEnd();

                        if (typeof oOptions.onComplete === "function") {
                            var sBatchStatus = String(
                                oData && oData.Status
                                    ? oData.Status
                                    : "S"
                            ).toUpperCase();
                            var bBatchSuccess =
                                sBatchStatus === "S" ||
                                sBatchStatus === "W";

                            oOptions.onComplete({
                                success: bBatchSuccess,
                                data: oData || {},
                                error: bBatchSuccess
                                    ? null
                                    : {
                                        message: oData.Message ||
                                            "SAP rechazó la anulación de la HU."
                                    },
                                payload: oPayload,
                                selections: aSelections
                            });
                            return;
                        }

                        var sStatus =
                            oData && oData.Status
                                ? oData.Status
                                : "S";

                        var sMessage =
                            oData && oData.Message
                                ? oData.Message
                                : "Proceso de anulación ejecutado.";

                        var sRunId =
                            oData && oData.RunId
                                ? oData.RunId
                                : "";

                        this.getVM().setProperty(
                            "/resultado",
                            {
                                Status: sStatus,
                                Message: sMessage
                            }
                        );

                        this.getVM().setProperty(
                            "/resultadoState",
                            this._getState(sStatus)
                        );

                        this.getVM().setProperty(
                            "/canCancel",
                            false
                        );

                        this.getVM().setProperty(
                            "/lastRunId",
                            sRunId
                        );

                        this.getVM().setProperty(
                            "/cancellationSummary",
                            sStatus === "S"
                                ? this._buildCancellationSummary(
                                    sMatDoc,
                                    aSelections,
                                    sRunId
                                )
                                : this._getEmptyCancellationSummary()
                        );

                        this.getVM().setProperty(
                            "/selectedSection",
                            "detail"
                        );

                        MessageToast.show(
                            "Solicitud de anulación enviada correctamente."
                        );

                        if (sRunId) {
                            this._getDetalleFinalByRunId(
                                sRunId
                            );
                        } else {
                            this._getDetalleFinalByMatDoc(
                                sMatDoc
                            );
                        }
                    }.bind(this),

                    error: function (oError) {
                        console.group(
                            "========== ERROR ANULACION SAP =========="
                        );

                        console.error("MÉTODO:");
                        console.error("POST");

                        console.error("URI ODATA:");
                        console.error(sPostUri);

                        console.error("JSON QUE SE INTENTÓ ENVIAR:");
                        console.error(
                            JSON.stringify(
                                oPayload,
                                null,
                                2
                            )
                        );

                        console.error("ERROR COMPLETO:");
                        console.error(oError);

                        console.error(
                            "ERROR SERIALIZADO:",
                            this._serializeError(oError)
                        );

                        console.groupEnd();

                        this._logError(
                            "_postAnulacion.error",
                            "Error al ejecutar la anulación",
                            {
                                traceId: sTraceId,
                                payload: oPayload,
                                error: this._serializeError(oError)
                            }
                        );

                        if (typeof oOptions.onComplete === "function") {
                            oOptions.onComplete({
                                success: false,
                                error: oError,
                                payload: oPayload,
                                selections: aSelections
                            });
                            return;
                        }

                        this.getVM().setProperty(
                            "/canCancel",
                            false
                        );

                        this._showODataError(
                            "Error al anular el documento.",
                            oError
                        );
                    }.bind(this)
                }
            );
        },

        _getDetalleFinalByRunId: function (sRunId) {
            var oModel = this.getModel();

            oModel.read("/AnulacionDetalleSet", {
                filters: [
                    new Filter(
                        "RunId",
                        FilterOperator.EQ,
                        sRunId
                    )
                ],

                success: function (oData) {
                    var aResults =
                        oData && oData.results
                            ? oData.results
                            : [];

                    this.getVM().setProperty(
                        "/detalle",
                        aResults
                    );

                    this.getVM().setProperty(
                        "/busy",
                        false
                    );

                    this._actualizarResultadoDesdeDetalle(
                        aResults
                    );
                }.bind(this),

                error: function (oError) {
                    this.getVM().setProperty(
                        "/detalle",
                        []
                    );

                    this.getVM().setProperty(
                        "/busy",
                        false
                    );

                    this._showODataError(
                        "Error al consultar el detalle final por RunId.",
                        oError
                    );
                }.bind(this)
            });
        },

        _getDetalleFinalByMatDoc: function (sMatDoc) {
            var oModel = this.getModel();

            oModel.read("/AnulacionDetalleSet", {
                filters: [
                    new Filter(
                        "MatDoc",
                        FilterOperator.EQ,
                        sMatDoc
                    )
                ],

                success: function (oData) {
                    var aResults =
                        oData && oData.results
                            ? oData.results
                            : [];

                    this.getVM().setProperty(
                        "/detalle",
                        aResults
                    );

                    this.getVM().setProperty(
                        "/busy",
                        false
                    );

                    this._actualizarResultadoDesdeDetalle(
                        aResults
                    );
                }.bind(this),

                error: function () {
                    this.getVM().setProperty(
                        "/detalle",
                        []
                    );

                    this.getVM().setProperty(
                        "/busy",
                        false
                    );
                }.bind(this)
            });
        },

        _actualizarResultadoDesdeDetalle: function (aDetalle) {
            if (!aDetalle || !aDetalle.length) {
                return;
            }

            var oError = aDetalle.find(function (oItem) {
                return oItem.Status === "E";
            });

            var oWarning = aDetalle.find(function (oItem) {
                return oItem.Status === "W";
            });

            var oSuccess = aDetalle.find(function (oItem) {
                return oItem.Status === "S";
            });

            var oFinal =
                oError ||
                oWarning ||
                oSuccess ||
                aDetalle[0];

            this.getVM().setProperty("/resultado", {
                Status: oFinal.Status || "",
                Message:
                    oFinal.Message ||
                    "Proceso consultado correctamente."
            });

            this.getVM().setProperty(
                "/resultadoState",
                this._getState(oFinal.Status || "")
            );
        },

        _getState: function (sStatus) {
            if (sStatus === "S") {
                return "Success";
            }

            if (sStatus === "E") {
                return "Error";
            }

            if (sStatus === "W") {
                return "Warning";
            }

            if (sStatus === "I") {
                return "Information";
            }

            return "None";
        },

        formatDetalleState: function (sStatus) {
            return this._getState(sStatus);
        },

        formatStatusText: function (sStatus) {
            if (sStatus === "S") {
                return "Éxito";
            }

            if (sStatus === "E") {
                return "Error";
            }

            if (sStatus === "W") {
                return "Advertencia";
            }

            if (sStatus === "I") {
                return "Información";
            }

            return sStatus || "Sin ejecutar";
        },
        _getInitialState: function () {
    return {
        matDoc: "",
        canCancel: false,
        busy: false,
        lastRunId: "",
        selectedSection: "preview",

        resultado: {
            Status: "",
            Message: ""
        },

        resultadoState: "None",
        cancellationSummary: this._getEmptyCancellationSummary(),
        preview: [],
        previewDisplay: [],
        previewHeader: {},
        previewItems: [],
        expandedPreviewGroups: {},
        detalle: [],

        summary: {
            total: 0,
            hu: 0,
            material: 0,
            otros: 0,
            huPendientes: 0,
            huSelectionPending: 0
        },

        providerDialog: {
            rowPath: "",
            huVenum: "",
            huExidv: "",
            providerCount: 0,
            purchaseOrderCount: 0,
            optionCount: 0,
            infoText: "",
            providers: [],

            // Selección múltiple.
            selectedProviderKeys: [],
            selectedCount: 0,
            canConfirm: false,

            // Compatibilidad con fragmentos/versiones anteriores.
            selectedProviderKey: ""
        },

        statusMessageDialog: {
            title: "Mensaje de SAP",
            message: "",
            sourceText: "Respuesta de SAP"
        },

        confirmationDialog: {
            matDoc: "",
            total: 0,
            hu: 0,
            huSeleccionadas: 0,
            material: 0,
            otros: 0,
            selectionCount: 0,
            selections: []
        }
    };
},


        onShowPreview: function () {
            this.getVM().setProperty(
                "/selectedSection",
                "preview"
            );
        },

        onShowFinalDetail: function () {
            this.getVM().setProperty(
                "/selectedSection",
                "detail"
            );
        },

        _showODataError: function (
            sDefaultMessage,
            oError
        ) {
            var sMessage = sDefaultMessage;

            try {
                if (oError && oError.responseText) {
                    var oResponse =
                        JSON.parse(oError.responseText);

                    if (
                        oResponse &&
                        oResponse.error &&
                        oResponse.error.message &&
                        oResponse.error.message.value
                    ) {
                        sMessage =
                            oResponse.error.message.value;
                    }
                } else if (
                    oError &&
                    oError.message
                ) {
                    sMessage = oError.message;
                }
            } catch (e) {
                if (
                    oError &&
                    oError.message
                ) {
                    sMessage = oError.message;
                }
            }

            this.getVM().setProperty("/resultado", {
                Status: "E",
                Message: sMessage
            });

            this.getVM().setProperty(
                "/resultadoState",
                "Error"
            );

            this.getVM().setProperty(
                "/busy",
                false
            );

            this._showStatusMessageDialog(
                sMessage,
                "Error de comunicación con SAP"
            );
        }
    });
});

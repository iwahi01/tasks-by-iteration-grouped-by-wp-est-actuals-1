Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',
    scopeType: 'iteration',
    _allowedStates:[],
    _tasks:null,
    comboboxConfig: {
        fieldLabel: 'Select iteration:',
        labelWidth: 100,
        width: 300
    },
    onScopeChange: function() {
        this._getTaskModel().then({
            success: this._getStateAllowedValues,
            scope:this
        }).then({
            success:this._makeStore,
            scope:this
         });
    },
    
    _getTaskModel:function(){
        return Rally.data.ModelFactory.getModel({
            type:'Task'
        });
    },
    
    _getStateAllowedValues:function(model){
        var deferred = Ext.create('Deft.Deferred');
        var allowedStateValues = [];
        model.getField('State').getAllowedValueStore().load({
            callback: function(records,operation,success){
                Ext.Array.each(records,function(allowedValue){
                    allowedStateValues.push(allowedValue.get('StringValue'));
                });
                if(success){
                    deferred.resolve(allowedStateValues);
                }
                else{
                    deferred.reject();
                }

            }
        }) ;
        return deferred.promise;
        
    },
    
    _makeStore:function(allowedStates){
        this._allowedStates = allowedStates;
        Ext.create('Rally.data.wsapi.Store', {
                model: 'Task',
                fetch: ['ObjectID', 'FormattedID', 'Name', 'State', 'Owner', 'WorkProduct', 'Estimate', 'Actuals','Blocked','ScheduleState'],
                autoLoad: true,
                filters: this.getContext().getTimeboxScope().getQueryFilter(),
                listeners: {
                    load: this._onDataLoaded,
                    scope: this
                }
        });
    },
    _onDataLoaded: function(store, records){
        if (records.length === 0) {
            this._notifyNoTasks();
        }
        
        else{
            if (this._notifier) {
                this._notifier.destroy();
            }
            var that = this;
            var promises = [];
            _.each(records, function(task) {
                promises.push(that._getWorkproduct(task, that));
            });

            Deft.Promise.all(promises).then({
                success: function(results) {
                    that._tasks = results;
                    that._makeGrid();
                }
            });
        }
        
    },
    _getWorkproduct: function(task, scope) {
        var that = scope;
        var deferred = Ext.create('Deft.Deferred');
        var artifactOid = task.get('WorkProduct').ObjectID;
        var artifactType = task.get('WorkProduct')._type;
        Rally.data.ModelFactory.getModel({
            type: artifactType,
            scope: this,
            success: function(model, operation) {
                model.load(artifactOid,{
                    scope: this,
                    success: function(record, operation) {
                        var difference;
                        var taskEstimate = task.get('Estimate');
                        var taskActuals = task.get('Actuals');
                        var artifactState = record.get('ScheduleState');
                        var artifactFid = record.get('FormattedID');
                        var taskRef     = task.get('_ref');
                        var taskFid     = task.get('FormattedID');
                        
                        if (taskActuals === null)  {
                            difference = 0;    
                        }
                        else{
                            difference = taskActuals - taskEstimate;
                        }

                        var blocked = task.get('Blocked');
                        var taskName    = task.get('Name');
                        var taskState   = task.get('State');
                        var taskOwner       = (task.get('Owner')) ? task.get('Owner')._refObjectName : "None";
                        var workproduct = artifactFid + ', ScheduleState: ' + artifactState;
                        
                        result = {
                                    "_ref"          : taskRef,
                                    "FormattedID"   : taskFid,
                                    "Name"          : taskName,
                                    "Estimate"      : taskEstimate,
                                    "Actuals"       : taskActuals,
                                    "Difference"    : difference,
                                    "Blocked"       : blocked,
                                    "State"         : taskState,
                                    "ScheduleState" : artifactState,
                                    "Owner"         : taskOwner,
                                    "WorkproductID" : artifactFid,
                                    "Workproduct"   : workproduct
                                    
                                };
                        deferred.resolve(result);    
                    }
                });
            }
        });
        return deferred;
    },
    _makeGrid: function() {
        var that = this;
        if (that._grid) {
            that._grid.destroy();
        }
        var gridStore = Ext.create('Rally.data.custom.Store', {
            data: that._tasks,
            groupField: 'Workproduct',
            limit: Infinity
        });
        that._grid = Ext.create('Rally.ui.grid.Grid', {
            itemId: 'taskGrid',
            store: gridStore,
            features: [{ftype:'groupingsummary'}],
            minHeight: 500,
            columnCfgs: [
                {
                    text: 'Formatted ID', dataIndex: 'FormattedID', xtype: 'templatecolumn',
                    tpl: Ext.create('Rally.ui.renderer.template.FormattedIDTemplate')
                },

                {
                    text: 'Name', dataIndex: 'Name',
                    summaryRenderer: function() {
                        return "Totals:"; 
                    }
                },
                {
                    text: 'Estimate', dataIndex: 'Estimate', 
                    summaryType: 'sum'
                },
                {
                    text: 'Actuals', dataIndex: 'Actuals',
                    summaryType: 'sum'
                },
                {
                    text: 'E - A', dataIndex: 'Difference',
                        renderer: function(value){
                            if (value > 0) {
                                return '<span style="color:red;">' + value + '</span>'
                            }
                            else{
                                return '<span style="color:black;">' + value + '</span>'
                            }
                        },
                    summaryType: 'sum'
                },
                {
                    text: 'State', dataIndex: 'State',xtype: 'templatecolumn',
                        tpl: Ext.create('Rally.ui.renderer.template.ScheduleStateTemplate',
                            {
                                states: that._allowedStates,
                                field: {
                                    name: 'State' 
                                }
                        })
                },
                {
                    text: 'Owner', dataIndex: 'Owner'
                }
            ]
        });
        that.add(that._grid);
        that._grid.reconfigure(gridStore);
    },
    _notifyNoTasks: function() {
        if (this._grid) {
            this._grid.destroy();
        }
        if (this._notifier) {
            this._notifier.destroy();
        }
        this._notifier =  Ext.create('Ext.Container',{
                xtype: 'container',
                itemId: 'notifyContainer',
                html: "No Tasks found that match selection."
            });
        this.add( this._notifier);  
    }
});

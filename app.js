"use strict";
window.onload = function(){

    var load_check_interval = setInterval(function(){

        if(window.innerWidth >= 1 && window.innerHeight >= 1){
            //Preload images and initialize data first
            SYS_DTL.initialize();
            //Prepapre the interface
            SYS_Interface.initialize();
            //Store an original copy of SYS_Data.battle
            SYS_Data.battle_original_copy = SYS_Utils.copyObject(SYS_Data.battle);
            //Start first game scene
            SC_INITIALIZER.initialize();
            
            clearInterval(load_check_interval);
           
        };

    },1);
};var ACTION_Module_01 = (function(){var f ={};
/*  
    -----------------------------------------------------------------------
    Send One Projectile for each locations from Source Unit Position and
    will travel straight to the target location until the battle arena border is reached
    -----------------------------------------------------------------------
    REQUIRED SETUP PARAMETERS
    mode:"on_attack",func:()=>{return ACTION_Module_03;},
    setup:{ speed:4, detection_distance:10 },
    sfx:{  image:"sfx_lion_attack", size:{w:40,h:40}, anim_speed:0.5, rotation:50},
    locations:[{ytile:"opposite",xtile:"opposite"}], //location is where the projectile will go
    effects:[
        //{type:"damage", targets:["user"], modifier:"normal", amount:[["source_unit","power",1]]},
        //{type:"stats", targets:["owner"], mode:"add", stat:"power", amount:10},
        {type:"stats", targets:["user"], mode:"add", stat:"hm", amount:100},
    ]
*/

f.getData = function(bd,ac){
    var target_pos = null;
    var ac_data = { projectiles:[] };
    var projectile = {};
    var sfx = {};

    ac.configs.locations.forEach(loc => {

        target_pos = ENGINE_Physics.getTileRelativeToTile( ac.source_unit.tile_pos, loc.ytile, loc.xtile);

        projectile = {
            id:ENGINE_Utils.idGenerator(5),
            timer:0,
            effect_done:false, //true if the projectile triggers effect
            configs:ENGINE_Utils.copyObject(ac.configs),
            target_tile: target_pos,
            source_pos: {x:ac.source_unit.axis_pos.x, y:ac.source_unit.axis_pos.y},
            target_pos: ENGINE_Physics.convertTile("axis",target_pos),
            //We need degrees because projectile must move outside the border
            target_degrees: ENGINE_Physics.getDegrees(ac.source_unit.axis_pos,ENGINE_Physics.convertTile("axis",target_pos)),
        };

        if(typeof(loc.xaxis) !== "undefined"){
            projectile.source_pos.x += loc.xaxis;
            projectile.target_pos.x += loc.xaxis;
        };

        sfx = { id:projectile.id, 
            image:projectile.configs.sfx.image, 
            owner:ac.source_unit.owner_tag, 
            size:projectile.configs.sfx.size, 
            mode: projectile.configs.sfx.mode, 
            pos:projectile.source_pos };
        
        bd = ENGINE_SFX.create(bd,sfx);
        ac_data.projectiles.push(projectile);
       
    });

    return {data:ac_data, bd:bd};
};

f.update = function(bd,ac){

    var sfx = null;
    var sfx_done_count = 0;   
    
    ac.data.projectiles.forEach((projectile)=>{
        sfx = bd.sfx[ENGINE_Utils.get_SFXIndex(projectile.id,bd.sfx)];
        //It becomes undefined if it was deleted first at ENGINE_SFX.cleanup;
        if(typeof(sfx) !== "undefined"){
            if(sfx.is_dead === false){
                bd = updateProjectile(bd,projectile,ac,sfx);
            }else{
                sfx_done_count += 1;
            };
        }else {
            sfx_done_count += 1;
        };
    });
  
    if(sfx_done_count ===  ac.data.projectiles.length){
        ac.execution_done = true;
        bd = cleanup(bd,ac);
    };

    return bd;
};

function updateProjectile(bd,projectile,ac,sfx){
    var pc = projectile.configs;

    //Play SFX Animation
    projectile.timer += 1;
    if(typeof(sfx) !== "undefined"){
        if(projectile.timer % pc.sfx.anim_speed === 0){ 
            sfx.frame_data = ENGINE_SFX.updateFrame(sfx.image,sfx.frame_data,sfx.mode);
            sfx = ENGINE_SFX.animate(sfx, pc.sfx.rotation, pc.sfx.change_size);
        };
    };

    var move_params = {  speed:pc.setup.speed, source:sfx.axis_pos, degrees:projectile.target_degrees};
    var p = ENGINE_Physics.moveForward(move_params);
    
    sfx.axis_pos.x = p.x;
    sfx.axis_pos.y = p.y;
    if(typeof(pc.sfx.rotation) !== "number"){  sfx.rotation = p.r; };

    
    if(projectile.effect_done === false){

        var dist = ENGINE_Physics.getDistance(sfx.axis_pos,projectile.target_pos);
       
        if(dist <= pc.setup.detection_distance){

            var target_unit = null;
            var target_units = [];

            bd.units.forEach(u => {
                if(projectile.target_tile === u.tile_pos){
                    target_unit = u;
                };
            });

            target_units.push(target_unit);

            pc.effects.forEach(effect=>{
                bd = window["MECHANIC_Effects"][`apply_${effect.type}`](bd,{
                    effect:effect, 
                    action:ac,
                    target_units:target_units
                });
            });

            projectile.effect_done = true;
        };
    };
    
    if(ENGINE_Physics.detectIfBorderReached(bd,sfx.axis_pos) === true){
        sfx.is_dead = true;
    };

    return bd;
};

function cleanup(bd,ac){

    ac.data.projectiles.forEach((projectile)=>{
        var sfx = bd.sfx[ENGINE_Utils.get_SFXIndex(projectile.id,bd.sfx)];
        //It becomes undefined if it was deleted first at ENGINE_SFX.cleanup;
        if(typeof(sfx) !== "undefined"){
            sfx.is_dead = true;
        };
    });

    return bd;
};

return f;}());var ACTION_Module_02 = (function(){var f ={};
/*  
    -----------------------------------------------------------------------
    Send Single Projectile that will start from locations[0] then travel to other locations
    until all the location was reached by the Projectile. Any target units that are located 
    in one of the locations array then will be applied with the ability effect
    -----------------------------------------------------------------------
    REQUIRED SETUP PARAMETERS
    {
        mode:"on_attack",func:()=>{return ACTION_Module_02;},
        setup:{ speed:4, detection_distance:5 },
        sfx:{  image:"sfx_sword_attack", size:{w:40,h:20}, anim_speed:0.5},//, rotation:50},
        locations:[{ytile:"same",xtile:"same"}, {ytile:"opposite",xtile:"same"}], //index 0 is the starting point
        effects:[
            {type:"damage", targets:["enemy"], modifier:"normal", amount:[500]},
            {type:"stats", targets:["enemy"], mode:"reduce", stat:"health_max", amount:30},
        ]
    }
*/

f.getData = function(bd,ac){
    var target_pos = null;
    var ac_data = { projectile:{}, reach_count:0, locations:[], location_reached:[], location_effected:[] };
    var sfx = {};

    ac.configs.locations.forEach(loc => {

        target_pos = ENGINE_Physics.getTileRelativeToTile( ac.source_unit.tile_pos, loc.ytile, loc.xtile);

        if(target_pos !== null){
            ac_data.locations.push(target_pos);
            ac_data.location_reached.push(false);
            ac_data.location_effected.push(false);
        };
    });

    if(ac_data.locations.length >= 1){
        ac_data.projectile = {
            id:ENGINE_Utils.idGenerator(5),
            timer:0,
            configs:ENGINE_Utils.copyObject(ac.configs),
            source_pos: ENGINE_Physics.convertTile("axis",ac_data.locations[0]),
            target_pos: ENGINE_Physics.convertTile("axis",ac_data.locations[0]),
            //We need degrees because projectile must move outside the border
            target_degrees: ENGINE_Physics.getDegrees(ac.source_unit.axis_pos,ENGINE_Physics.convertTile("axis",ac_data.locations[0])),
        };
    
        sfx = { id:ac_data.projectile.id, 
            image:ac_data.projectile.configs.sfx.image, 
            owner:ac.source_unit.owner_tag, 
            size:ac_data.projectile.configs.sfx.size, 
            mode: ac_data.projectile.configs.sfx.mode, 
            pos: ac_data.projectile.source_pos };
            
        bd = ENGINE_SFX.create(bd,sfx);
    };

    return {data:ac_data, bd:bd};
};

f.update = function(bd,ac){

    var sfx = null;
    var sfx_done = false;
    
    sfx = bd.sfx[ENGINE_Utils.get_SFXIndex(ac.data.projectile.id,bd.sfx)];
    //It becomes undefined if it was deleted first at ENGINE_SFX.cleanup;
    if(typeof(sfx) !== "undefined"){
        if(sfx.is_dead === false){
            bd = updateProjectile(bd,ac.data.projectile,ac,sfx);
        }else{
            sfx_done = true;
        };
    }else {
        sfx_done = true;
    };
  
    if(sfx_done === true){
        ac.execution_done = true;
        bd = cleanup(bd,ac);
    };

    return bd;
};

function updateProjectile(bd,projectile,ac,sfx){
    var pc = projectile.configs;

    //Play SFX Animation
    projectile.timer += 1;
    if(typeof(sfx) !== "undefined"){
        if(projectile.timer % pc.sfx.anim_speed === 0){ 
            sfx.frame_data = ENGINE_SFX.updateFrame(sfx.image,sfx.frame_data,sfx.mode);
            sfx = ENGINE_SFX.animate(sfx, pc.sfx.rotation, pc.sfx.change_size);
        };
    };

    var dist = ENGINE_Physics.getDistance(sfx.axis_pos,projectile.target_pos);

    if(dist <= pc.setup.detection_distance){
        bd = applyEffect(bd,ac,sfx);
        ac.data.location_reached[ac.data.reach_count] = true;
        ac.data.reach_count += 1;

        if(typeof(ac.data.locations[ac.data.reach_count]) !== "undefined"){
            projectile.target_pos = ENGINE_Physics.convertTile("axis",ac.data.locations[ac.data.reach_count]);
            projectile.target_degrees = ENGINE_Physics.getDegrees(sfx.axis_pos,ENGINE_Physics.convertTile("axis",ac.data.locations[ac.data.reach_count]));
        }else{
            sfx.is_dead = true;
        };
    };


    if(ac.data.location_reached[ac.data.reach_count] === false && sfx.is_dead === false){
        var move_params = {  speed:pc.setup.speed, source:sfx.axis_pos, degrees:projectile.target_degrees};
        var p = ENGINE_Physics.moveForward(move_params);
        
        sfx.axis_pos.x = p.x;
        sfx.axis_pos.y = p.y;
        if(typeof(pc.sfx.rotation) !== "number"){  sfx.rotation = p.r; };
    };

    return bd;
};

function applyEffect(bd,ac,sfx){
    if(ac.data.location_effected[ac.data.reach_count] === false){

        var target_units = [];
        var target_unit = null;
        var dist = null;

        bd.units.forEach(u => {
            dist = ENGINE_Physics.getDistance(u.axis_pos,sfx.axis_pos);

            if(dist <= ac.data.projectile.configs.setup.detection_distance){
                target_unit = u;
            };
        });

        target_units.push(target_unit);

        ac.data.projectile.configs.effects.forEach(effect=>{
            bd = window["MECHANIC_Effects"][`apply_${effect.type}`](bd,{
                effect:effect, 
                action:ac,
                target_units:target_units
            });
        });

        ac.data.location_effected[ac.data.reach_count] = true;
    };
    return bd;
};

function cleanup(bd,ac){

    var sfx = bd.sfx[ENGINE_Utils.get_SFXIndex(ac.data.projectile.id,bd.sfx)];
    //It becomes undefined if it was deleted first at ENGINE_SFX.cleanup;
    if(typeof(sfx) !== "undefined"){
        sfx.is_dead = true;
    };

    return bd;
};

return f;}());var ACTION_Module_03 = (function(){var f ={};
/*  
    -----------------------------------------------------------------------
    Create an SFX at every location array every activation of an instance that will last
    depends on the duration. Even though there is no SFX at the target unit location it
    will still apply the effect to the units location inside target_units array
    -----------------------------------------------------------------------
    REQUIRED SETUP PARAMETERS
    mode:"on_spawn", func:()=>{return ACTION_Ability;},
    setup:{ instances:3, duration:100, wait_activation:1, wait_end:10 },
    sfx:{  image:"sfx_book_attack", size:{w:40,h:40}, anim_speed:0.5, rotation:50},
    target_units:[ {ytile:"same",xtile:"left"},{ytile:"same",xtile:"right"} ],
    location:{ytile:"opposite",xtile:"center"},
    effects:[
                {type:"damage", targets:["owner"], amount:[["source_unit","power",1]]},
                {type:"stats", targets:["owner"], mode:"add", stat:"power", amount:100},
                {type:"stats", targets:["user"], mode:"add", stat:"hm", amount:100},
            ]
*/

f.getData = function(bd,ac){
    var ac_data = { duration:0,
                    instance:0,
                    instance_activated:[],
                    instance_data:[] };
    var target_pos = null;
    var instance = {};

    for(var i = 1; i <= ac.configs.setup.instances; i++){

        target_pos = ENGINE_Physics.getTileRelativeToTile( ac.source_unit.tile_pos,  ac.configs.location.ytile,  ac.configs.location.xtile);
        
        if(target_pos !== null){
            instance = {
                id:ENGINE_Utils.idGenerator(5),
                timer:0,
                effect_done:false, //true if the projectile triggers effect
                configs:ENGINE_Utils.copyObject(ac.configs),
                target_pos: ENGINE_Physics.convertTile("axis",target_pos)
            };
    
            //We need to put an Specific ID to all the Effects
            //so that a unit will not recieved the same effect if triggered
            //multiple times by various targets because every instance
            //need to apply its own set of effects
            instance.configs.effects.forEach(eff => {
                eff.id = `${ac.id}-${ENGINE_Utils.idGenerator(5)}-${instance.id}`;
            });
    
    
            ac_data.instance_activated.push(false);
            ac_data.instance_data.push(ENGINE_Utils.copyObject(instance));
        };
    };

    return {data:ac_data, bd:bd};
};

f.update = function(bd,ac){

    if(ac.data.instance < ac.configs.setup.instances){
        ac.data.duration += 1;

        var instance = ac.data.instance_data[ac.data.instance];
        var config = instance.configs;
        var sfx = {};

        //Create SFX on start
        if(typeof(config.sfx) !== "undefined"){
            if(ac.data.duration === 1){
                sfx = { id:instance.id, 
                    image:config.sfx.image,
                    owner:ac.source_unit.owner_tag, 
                    size:config.sfx.size, 
                    mode:config.sfx.mode,
                    pos:instance.target_pos };
        
                bd = ENGINE_SFX.create(bd,sfx);
            };

            sfx = bd.sfx[ENGINE_Utils.get_SFXIndex(instance.id,bd.sfx)];

            //Play SFX Animation
            instance.timer += 1;
            if(typeof(sfx) !== "undefined"){
                if(instance.timer % config.sfx.anim_speed === 0){ 
                    sfx.frame_data = ENGINE_SFX.updateFrame(sfx.image,sfx.frame_data,sfx.mode);
                    sfx = ENGINE_SFX.animate(sfx, config.sfx.rotation, config.sfx.change_size);
                };
            };
        };
    
        if(ac.data.instance_activated[ac.data.instance] === false){

            if(ac.data.duration === ac.configs.setup.wait_activation){
                ac.data.instance_activated[ac.data.instance] = true;
                bd = applyEffect(bd,ac.data.instance_data[ac.data.instance],ac);
            };
        };

        if(ac.data.duration === ac.configs.setup.duration){
            bd = cleanup(bd,ac.data.instance_data[ac.data.instance]);
        };

        if(ac.data.duration >= ac.configs.setup.duration + ac.configs.setup.wait_end){
            ac.data.duration = 0;
            ac.data.instance += 1;
        };

    }else if(ac.data.instance === ac.configs.setup.instances){
        ac.execution_done = true;
    };

    return bd;
};

function applyEffect(bd,instance,ac){
    if(instance.effect_done === false){

        var tile = null;
        var target_unit = null;
        var target_units = [];

        instance.configs.target_units.forEach(target => {
            target_unit = null;
            bd.units.forEach(u => {
                tile = ENGINE_Physics.getTileRelativeToTile( ac.source_unit.tile_pos, target.ytile, target.xtile);
                if(JSON.stringify(u.axis_pos) === JSON.stringify( ENGINE_Physics.convertTile("axis",tile))){
                    target_unit = u;
                };
            });
            target_units.push(target_unit);
        });

        instance.configs.effects.forEach(effect=>{
            bd = window["MECHANIC_Effects"][`apply_${effect.type}`](bd,{
                effect:effect, 
                action:ac,
                target_units:target_units
            });
        });

        instance.effect_done = true;
    };
    return bd;
};

function cleanup(bd,instance){
    
    var sfx = bd.sfx[ENGINE_Utils.get_SFXIndex(instance.id,bd.sfx)];
    //It becomes undefined if it was deleted first at ENGINE_SFX.cleanup;
    if(typeof(sfx) !== "undefined"){
        sfx.is_dead = true;
    };

    return bd;
};

return f;}());var DTL_IMAGE_Commander = (function(){var f ={}; f.list = [
//=============================================================
{  name:"commander_0", link:"commander/commander_0.png" }
,{  name:"commander_1", link:"commander/commander_1.png" }
,{  name:"commander_2", link:"commander/commander_2.png" }
,{  name:"commander_3", link:"commander/commander_3.png" }
//=============================================================
]; return f;}());var DTL_IMAGE_Interface = (function(){var f ={}; f.list = [
//=============================================================
{  name:"game_developer", link:"interface/game_developer.png"},
{  name:"game_title", link:"interface/game_title.png"},
//=============================================================
{  name:"background_body", link:"interface/background_body.png"},
{  name:"background_white_type1", link:"interface/background_white_type1.png"},
{  name:"background_white_type2", link:"interface/background_white_type2.png"},
{  name:"background_white_type3", link:"interface/background_white_type3.png"},
{  name:"background_white_type4", link:"interface/background_white_type4.png"},
{  name:"background_white_type5", link:"interface/background_white_type5.png"},
{  name:"background_white_type6", link:"interface/background_white_type6.png"},
{  name:"background_white_type7", link:"interface/background_white_type7.png"},
{  name:"background_selection_type1", link:"interface/background_selection_type1.png"},
{  name:"background_selection_type2", link:"interface/background_selection_type2.png"},
{  name:"background_selection_type3", link:"interface/background_selection_type3.png"},
{  name:"background_spawntime", link:"interface/background_spawntime.png"},
{  name:"background_power", link:"interface/background_power.png"},
{  name:"background_vigor", link:"interface/background_vigor.png"},
//=============================================================
{  name:"button_play", link:"interface/button_play.png" },
{  name:"button_surrender", link:"interface/button_surrender.png" },
{  name:"button_start", link:"interface/button_start.png" },
{  name:"button_back", link:"interface/button_back.png" },
{  name:"button_continue", link:"interface/button_continue.png" },
{  name:"button_settings", link:"interface/button_settings.png" },
{  name:"button_randomize", link:"interface/button_randomize.png" },
{  name:"button_close", link:"interface/button_close.png" },
{  name:"button_next", link:"interface/button_next.png" },
{  name:"button_prev", link:"interface/button_prev.png" },
//=============================================================
{  name:"text_gameover", link:"interface/text_gameover.png" },
//=============================================================
{ name:"default", link:"interface/icon_default.png" }]; //MUST ALWAYS BE THE LAST
return f;}());var DTL_IMAGE_SFX = (function(){var f ={}; f.list = [
//! ALL SFX MUST HAVE FRAME DATA EVEN IT IS JUST ONE
/*******************************************************************************/
,{  name:"sfx_staff_attack", link:"sfx/sfx_staff_attack.png",
    frame_details:{w:350, h:200, number_of_frames:4, frame_flow:"up-to-down"} }
 //=============================================================
 ,{  name:"sfx_slingshot_attack", link:"sfx/sfx_slingshot_attack.png",
    frame_details:{w:600, h:600, number_of_frames:1, frame_flow:"left-to-right"} }
 //=============================================================
 ,{  name:"sfx_shield_attack", link:"sfx/sfx_shield_attack.png",
    frame_details:{w:800, h:800, number_of_frames:1, frame_flow:"left-to-right"} }
//=============================================================
,{  name:"sfx_gloves_attack", link:"sfx/sfx_gloves_attack.png",
    frame_details:{w:500, h:500, number_of_frames:7, frame_flow:"left-to-right"} }
//=============================================================
,{  name:"sfx_bow_attack", link:"sfx/sfx_bow_attack.png",
    frame_details:{w:700, h:300, number_of_frames:1, frame_flow:"left-to-right"} }
 //=============================================================
 ,{  name:"sfx_necklace_attack", link:"sfx/sfx_necklace_attack.png",
    frame_details:{w:600, h:700, number_of_frames:9, frame_flow:"left-to-right"} }
 //=============================================================
 ,{  name:"sfx_dagger_attack", link:"sfx/sfx_dagger_attack.png",
    frame_details:{w:1100, h:400, number_of_frames:1, frame_flow:"left-to-right"} }
 //=============================================================
,{  name:"sfx_armor_attack", link:"sfx/sfx_armor_attack.png",
    frame_details:{w:350, h:350, number_of_frames:1, frame_flow:"left-to-right"} }
,{  name:"sfx_armor_ability", link:"sfx/sfx_armor_ability.png",
   frame_details:{w:200, h:350, number_of_frames:5, frame_flow:"left-to-right"} }
 //=============================================================
 ,{  name:"sfx_axe_attack", link:"sfx/sfx_axe_attack.png",
    frame_details:{w:500, h:800, number_of_frames:1, frame_flow:"left-to-right"} }
//=============================================================
,{  name:"sfx_jetpack_attack", link:"sfx/sfx_jetpack_attack.png",
   frame_details:{w:400, h:400, number_of_frames:2, frame_flow:"left-to-right"} }
//=============================================================
,{  name:"sfx_jetpack_ability", link:"sfx/sfx_jetpack_ability.png",
   frame_details:{w:400, h:400, number_of_frames:2, frame_flow:"left-to-right"} }
//=============================================================
,{  name:"sfx_clam_attack", link:"sfx/sfx_clam_attack.png",
   frame_details:{w:500, h:175, number_of_frames:19, frame_flow:"up-to-down"} }
//=============================================================
,{  name:"sfx_torch_attack", link:"sfx/sfx_torch_attack.png",
   frame_details:{w:350, h:500, number_of_frames:6, frame_flow:"left-to-right"} }
//=============================================================
,{  name:"sfx_net_attack", link:"sfx/sfx_net_attack.png",
   frame_details:{w:400, h:300, number_of_frames:1, frame_flow:"left-to-right"} }
//=============================================================
,{  name:"sfx_book_attack", link:"sfx/sfx_book_attack.png",
   frame_details:{w:700, h:700, number_of_frames:1, frame_flow:"left-to-right"} }
,{  name:"sfx_book_ability", link:"sfx/sfx_book_ability.png",
   frame_details:{w:600, h:600, number_of_frames:5, frame_flow:"left-to-right"} }
//=============================================================
,{  name:"sfx_gatlinggun_attack", link:"sfx/sfx_gatlinggun_attack.png",
   frame_details:{w:270, h:160, number_of_frames:4, frame_flow:"left-to-right"} }
//=============================================================
,{  name:"sfx_mask_attack", link:"sfx/sfx_mask_attack.png",
   frame_details:{w:300, h:300, number_of_frames:5, frame_flow:"left-to-right"} },
{  name:"sfx_mask_ability", link:"sfx/sfx_mask_ability.png",
   frame_details:{w:950, h:570, number_of_frames:1, frame_flow:"left-to-right"} }
//=============================================================
,{  name:"sfx_teslacoil_attack", link:"sfx/sfx_teslacoil_attack.png",
   frame_details:{w:1500, h:299, number_of_frames:5, frame_flow:"up-to-down"} }
//=============================================================
,{  name:"sfx_barrel_ability", link:"sfx/sfx_barrel_ability.png",
   frame_details:{w:1000, h:600, number_of_frames:6, frame_flow:"up-to-down"} }
/*******************************************************************************/
]; return f;}());var DTL_IMAGE_Skins = (function(){var f ={}; f.list = [
//=============================================================
{  name:"skin_staff", link:"skins/skin_staff.png" }
,{  name:"skin_slingshot", link:"skins/skin_slingshot.png" }
,{  name:"skin_shield", link:"skins/skin_shield.png" }
,{  name:"skin_gloves", link:"skins/skin_gloves.png" }
,{  name:"skin_bow", link:"skins/skin_bow.png" }
,{  name:"skin_necklace", link:"skins/skin_necklace.png" }
,{  name:"skin_dagger", link:"skins/skin_dagger.png" }
,{  name:"skin_armor", link:"skins/skin_armor.png" }
,{  name:"skin_axe", link:"skins/skin_axe.png" }
,{  name:"skin_clam", link:"skins/skin_clam.png" }
,{  name:"skin_torch", link:"skins/skin_torch.png" }
,{  name:"skin_jetpack", link:"skins/skin_jetpack.png" }
,{  name:"skin_net", link:"skins/skin_net.png" }
,{  name:"skin_book", link:"skins/skin_book.png" }
,{  name:"skin_gatlinggun", link:"skins/skin_gatlinggun.png" }
,{  name:"skin_mask", link:"skins/skin_mask.png" }
,{  name:"skin_teslacoil", link:"skins/skin_teslacoil.png" }
,{  name:"skin_barrel", link:"skins/skin_barrel.png" }
//=============================================================
]; return f;}());var DTL_IMAGE_Status = (function(){var f ={}; f.list = [
//=============================================================
{  name:"status_invulrenable", link:"status/status_invulrenable.png" }
,{  name:"status_poison", link:"status/status_poison.png" }
,{  name:"status_slow", link:"status/status_slow.png" }
,{  name:"status_disarm", link:"status/status_disarm.png" }
//=============================================================
]; return f;}());var DTL_IMAGE_Symbols = (function(){var f ={}; f.list = [
//=============================================================
,{  name:"symbol_staff", link:"symbols/symbol_staff.png" }
,{  name:"symbol_slingshot", link:"symbols/symbol_slingshot.png" }
,{  name:"symbol_shield", link:"symbols/symbol_shield.png" }
,{  name:"symbol_gloves", link:"symbols/symbol_gloves.png" }
,{  name:"symbol_bow", link:"symbols/symbol_bow.png" }
,{  name:"symbol_necklace", link:"symbols/symbol_necklace.png" }
,{  name:"symbol_dagger", link:"symbols/symbol_dagger.png" }
,{  name:"symbol_armor", link:"symbols/symbol_armor.png" }
,{  name:"symbol_axe", link:"symbols/symbol_axe.png" }
,{  name:"symbol_clam", link:"symbols/symbol_clam.png" }
,{  name:"symbol_torch", link:"symbols/symbol_torch.png" }
,{  name:"symbol_jetpack", link:"symbols/symbol_jetpack.png" }
,{  name:"symbol_net", link:"symbols/symbol_net.png" }
,{  name:"symbol_book", link:"symbols/symbol_book.png" }
,{  name:"symbol_gatlinggun", link:"symbols/symbol_gatlinggun.png" }
,{  name:"symbol_mask", link:"symbols/symbol_mask.png" }
,{  name:"symbol_teslacoil", link:"symbols/symbol_teslacoil.png" }
,{  name:"symbol_barrel", link:"symbols/symbol_barrel.png" }
//=============================================================
]; return f;}());var DTL_Status = (function(){var f ={}; f.list = [
//=============================================================

//=== Found at MECHANIC_Damage.directDamage after damage calculations ====
{   idname:"invulrenable", name:"Invulrenable", description:"Any damage recieved will be reduced to zero"}

//=== Found at MECHANIC_Damage.directDamage after damage calculations ====
,{   idname:"poision", name:"Poison", description:"Every second deals damage to the target equal to 10% of target's Max Health"}

//=== Found at MECHANIC_AttackTime.update ====
,{   idname:"slow", name:"slow", description:"Doubles the amount of Attack Time required to perform an attack"}

//=============================================================

]; return f;}());var DTL_Units = (function(){var f ={}; f.list = [
/*0******************************************************************************/
{   idname:"staff", skin:"skin_staff",
    stats: { spawn:180, health:600, power:500, vigor:0, agility:250},
    attack: {range:1, type:"normal"},
    ability:"Every attack increases Power by 100 while it is less than 1200 points.",
    func:()=>{return UNIT_Staff;}
},
//=1============================================================
{   idname:"slingshot", skin:"skin_slingshot",
    stats: { spawn:180, health:600, power:500, vigor:0, agility:700},
    attack: {range:1, type:"normal"},
    ability:"Every attack decreases Agility by 40% until it reaches less than 50 points",
    func:()=>{return UNIT_Slingshot;}
},
//=2============================================================
{   idname:"shield", skin:"skin_shield",
    stats: { spawn:180, health:600, power:250, vigor:0, agility:250},
    attack: {range:1, type:"normal"},
    ability:"Upon spawning get INVULRENABLE Status for 100 seconds. INVULRENABLE Status means any damage received is set to zero",
    func:()=>{return UNIT_Shield;}
},
//=3============================================================
{   idname:"gloves", skin:"skin_gloves",
    stats: { spawn:180, health:600, power:200, vigor:750, agility:200},
    attack: {range:1, type:"normal"},
    ability:"Gains Vigor points equal to 10x of damage dealt after enemy's Vigor reduction with a max of 4000 points",
    func:()=>{return UNIT_Gloves;}
},
//=4============================================================
{   idname:"bow", skin:"skin_bow",
    stats: { spawn:180, health:800, power:300, vigor:100, agility:300},
    attack: {range:1, type:"pure"},
    ability:"Every attack deals Pure damage. Pure damage means enemy can't use its Vigor to reduce the damage",
    func:()=>{return UNIT_Bow;}
},
//=5============================================================
{   idname:"necklace", skin:"skin_necklace",
    stats: { spawn:180, health:2000, power:250, vigor:0, agility:250},
    attack: {range:1, type:"normal"},
    ability:"Every attack increase current Health equal to 10% of enemy's Max Health",
    func:()=>{return UNIT_Necklace;}
},
//=6============================================================
{   idname:"dagger", skin:"skin_dagger",
    stats: { spawn:180, health:800, power:50, vigor:200, agility:350},
    attack: {range:1, type:"normal"},
    ability:"Each attack applies POISON Status for 10 seconds to the enemy target.POISON Status deals PURE DAMAGE equal to 5% of enemy's Max Health",
    func:()=>{return UNIT_Dagger;}
},
//=7============================================================
{   idname:"armor", skin:"skin_armor",
    stats: { spawn:180, health:4000, power:50, vigor:50, agility:50},
    attack: {range:1, type:"normal"},
    ability:"Everytime this unit is damaged, gain Power equal to 20% of current Power same as to the Agility as well",
    func:()=>{return UNIT_Armor;}
},
//=8============================================================
{   idname:"axe", skin:"skin_axe",
    stats: { spawn:180, health:800, power:100, vigor:0, agility:200},
    attack: {range:1, type:"normal"},
    ability:"Every attack deals damage equal to Power and  50% of target's current Health",
    func:()=>{return UNIT_Axe;}
},
//=9============================================================
{   idname:"jetpack", skin:"skin_jetpack",
    stats: { spawn:180, health:1000, power:300, vigor:200, agility:150},
    attack: {range:1, type:"normal"},
    ability:"Upon spawning, increase the Agility of you and ally unit permanently by 150% but reduces Power and Max Health by 50% permanently",
    func:()=>{return UNIT_Jetpack;}
},
//=10============================================================
{   idname:"clam", skin:"skin_clam",
    stats: { spawn:180, health:600, power:350, vigor:250, agility:200},
    attack: {range:2, type:"normal"},
    ability:"Every attack applies SLOW Status to the target for 50 seconds. SLOW Status doubles the Attack Time required to do an attack.",
    func:()=>{return UNIT_Clam;}
},
//=11============================================================
{   idname:"torch", skin:"skin_torch",
    stats: { spawn:180, health:1000, power:50, vigor:100, agility:0},
    attack: {range:0, type:"none"},
    ability:"This unit can't perform an attack but it will burn any enemies that will attack for 3 times dealing normal damage equal to Power",
    func:()=>{return UNIT_Torch;}
},
//=12============================================================
{   idname:"net", skin:"skin_net",
    stats: { spawn:180, health:1200, power:0, vigor:0, agility:500},
    attack: {range:2, type:"normal"},
    ability:"Upon attacking, sends a net that deals pure damage to self equal to Max Health and also applies DISARM Status to all enemies for 1000 seconds. DISARM Status stops the unit from attacking.",
    func:()=>{return UNIT_Net;}
},
//=13============================================================
{   idname:"book", skin:"skin_book",
    stats: { spawn:180, health:800, power:100, vigor:100, agility:200},
    attack: {range:1, type:"normal"},
    ability:"When a unit recieves a STATUS gain 1 upgrade to Power and Vigor with a max of 7 upgrades. 1 upgrade equals to 100 permanent points.",
    func:()=>{return UNIT_Book;}
},
//=14============================================================
{   idname:"gatlinggun", name:"GATLING GUN", skin:"skin_gatlinggun",
    stats: { spawn:180, health:1200, power:150, vigor:0, agility:0},
    attack: {range:1, type:"normal"},
    ability:"Every second increase Agility permanently by 30 points and reduce max health by 10 points.",
    func:()=>{return UNIT_Gatling_Gun;}
},
//=15============================================================
{   idname:"mask", skin:"skin_mask",
    stats: { spawn:180, health:2000, power:100, vigor:0, agility:250},
    attack: {range:2, type:"normal"},
    ability:"When any of the units takes damage and its current Health falls below 50% then gain 300 power. That unit can only trigger this ability only once.",
    func:()=>{return UNIT_Mask;}
},
//=16============================================================
{   idname:"teslacoil",  name:"TESLA COIL", skin:"skin_teslacoil",
    stats: { spawn:180, health:800, power:100, vigor:0, agility:400},
    attack: {range:3, type:"normal"},
    ability:"Sends a lightning bolt that bounce to another ally or enemy target once it hit the intended target. Performs up to 3 bounces. Casting it increase current health equal to 50% of your power and it also do to the ally if it was hit.  When enemy is hit it recieves normal damage equal to 100% of your Power",
    func:()=>{return UNIT_Tesla_Coil;}
},
//=17============================================================
{   idname:"barrel", skin:"skin_barrel",
    stats: { spawn:180, health:200, power:0, vigor:0, agility:0},
    attack: {range:0, type:"none"},
    ability:"On death applies POISON Status to all units for 1000 seconds. POISON Status deals PURE DAMAGE equal to 5% of enemy's Max Health",
    func:()=>{return UNIT_Barrel;}
}
/***********************************************************************************/
]; return f;}());var ENGINE_Core = (function(){var f ={};

f.run = function(bd){
    //================== RUN BATTLE ============================
    if(bd.config.battle_is_over === false){
        if(bd.config.battle_time === 0){
            bd = ENGINE_Player.initializePlayers(bd);
        
            bd = ENGINE_Player.initializeSelection("opponent",bd);
            bd = ENGINE_Player.initializeSelection("user",bd);
        };

        //Increment time for battle record purposes
        //Also the longer the time the higher the user hp reduction
        //so we can prevent very long sessions
        bd.config.battle_time += 1;
        bd = MECHANIC_Events.start("on_timecount",bd,{source_unit:null});

        //Update Players
        bd = ENGINE_Player.updateOpponent(bd);
        bd = ENGINE_Player.updateUser(bd);
       
        //Update Units Stats
        bd = ENGINE_Unit.updateUnits(bd);

        //Update Actions
        bd = MECHANIC_Actions.update(bd);

        //Update Status
        bd = MECHANIC_Status.update(bd);

        //Clean SFX
        bd = ENGINE_SFX.cleanup(bd);
    };
    //================== CHECK GAME OVER =======================
    bd = f.gameOverCheck(bd);

    
    return bd;
};

f.gameOverCheck = function(bd){
    if(bd.user.surrendered === true){
        bd.config.battle_is_over = true;
    }else if(bd.user.surrendered === false){
        if(bd.user.stats.health_current <= 0){
            bd.config.battle_is_over = true;
        };
    };
    return bd;
};

return f;}());var ENGINE_Physics = (function(){var f ={};

f.tile_list = ["top_left","top_right","bottom_left","bottom_right"];

f.detectIfBorderReached = function(bd,pos){
    /*
        ============================!!!! DO NOT DELETE !!!!======================================
        There is a weird quirk on HTML5 Canvas. If the object's y position is less than
        the negative half value of bd.config.arena_size.h then the y pixel value on HTML5 Canvas
        goes downward again. For example, if arena_size height is 60, if the object's y position
        is lesser than -30 then the HTML5 Canvas will render the object downward even if the
        code commands the object to go upward. BUT THIS ONLY HAPPENS ON Y AXIS!.
        So the solution for the problem is that if the object's x and y position reached a certain
        axis then we will trigger the reached border limit no matter what the size of the object's
        image and even though the object's image is not completely rendered outside the canvas
        ==========================================================================================
    */
    var limit_x = {min:(bd.config.arena_size.w / 2) * -1, max:bd.config.arena_size.w / 2};
    var limit_y = {min:(bd.config.arena_size.h / 2) * -1, max:bd.config.arena_size.h / 2};

    if(pos.x <= limit_x.min  || pos.x >= limit_x.max  ){ return true; };
    if(pos.y <= limit_y.min  || pos.y >= limit_y.max  ){ return true; };
    
    return false;
};

f.convertMoveRotationToModelRotation = function(move_degrees){ 
    var n1 = move_degrees - 180; 
    var n2 = n1 - 360;
    var n3 = Math.abs(n2 % 360);
    var n4 = n3 * (Math.PI / 180);
    return n4;
};

f.getDistance = function(axis1,axis2){
    var d = Math.sqrt((axis2.x - axis1.x) * (axis2.x - axis1.x) + (axis2.y - axis1.y) * (axis2.y - axis1.y));
    return d;
};

f.getDegrees = function(axis1,axis2){
    var degrees = Math.atan2(axis1.y - axis2.y, axis1.x - axis2.x) * 180 / Math.PI + 180;
    return degrees;
};

f.moveForward = function(params){
    var degrees = typeof(params.degrees) !== "undefined" ? params.degrees : f.getDegrees(params.source,params.target);
    var radians = degrees * (Math.PI / 180);

    return { 
        x:params.source.x += (params.speed * Math.cos(radians)),
        y:params.source.y += (params.speed * Math.sin(radians)),
        r:f.convertMoveRotationToModelRotation(degrees)
    };
};

f.getTileRelativeToTile = function(source_tile,ytile,xtile){
    //source_tile = ex. top_right
   //ytile = top,center,bottom
   //xtile = left,center,right
   var source_pos = source_tile.split("_");
   var xtile_opposites = {left:"right",center:"center",right:"left"};

   var new_ytile = {
        same: source_pos[0],
        opposite: source_pos[0] === "top" ? "bottom" : "top",
        center:"center"
   };

   var new_xtile = {
        same: source_pos[1],
        opposite: xtile_opposites[source_pos[1]],
        left:"left",
        center:"center",
        right:"right",
   };

   if(typeof(new_ytile[ytile]) !== "undefined" && typeof(new_xtile[xtile]) !== "undefined"){
        return `${new_ytile[ytile]}_${new_xtile[xtile]}`;

   }else{
        return null;
   };

};

f.convertTile = function(mode,tile){
    switch(mode){
        case "axis":
            var axis = {  
                 //----------------------------------------------------------------
                top_left:{x:-25,y:20},     top_center:{x:0,y:20},     top_right:{x:25,y:20},
                //----------------------------------------------------------------
                center_left:{x:-25,y:0},   center_center:{x:0,y:0},   center_right:{x:25,y:0},
                //----------------------------------------------------------------
                bottom_left:{x:-25,y:-20}, bottom_center:{x:0,y:-20}, bottom_right:{x:25,y:-20}
            };
            return axis[tile];
        case "tile":
           var tile_array = tile.split("_");
            return tile_array[1];
        default: return null;
    };
};

return f;}());var ENGINE_Player = (function(){var f ={};

f.initializePlayers = function(bd){

    //Initialize Opponent
    bd.opponent.spawn_timer.left = 30;
    bd.opponent.spawn_timer.right = 30;

    //Initialize User
    var commander_hp = [10000,1500,100,1000];
    SYS_Data.battle.user.stats.health_current = commander_hp[SYS_Data.battle.user.commander];
    SYS_Data.battle.user.stats.health_max = commander_hp[SYS_Data.battle.user.commander];
    

    return bd;
};

f.initializeSelection = function(player,bd){

    var u = bd[player];
    u.units.selection = [];
    u.units.reserved = [];
    var rand = 0, target = 0;

    for(var i = 0; i <= u.units.loadout.length - 1;i++){
        u.units.reserved.push(i);
    };

    do{ 
        rand = ENGINE_Utils.rng(0,u.units.reserved.length - 1);
        target = u.units.reserved[rand];
        if(u.units.selection.indexOf(target) <= -1){
            u.units.selection.push(target);
            u.units.reserved = ENGINE_Utils.removeDataFromArray(target,u.units.reserved);
        };
    }while(u.units.selection.length < 3);

    var new_selection = [];
    var new_reserved = [];

    u.units.selection.forEach(us => {
        new_selection.push( ENGINE_Utils.copyObject(ENGINE_Unit.createUnit(player, u.units.loadout[us], bd)) );
    });

    u.units.reserved.forEach(ur => {
        new_reserved.push( ENGINE_Utils.copyObject(ENGINE_Unit.createUnit(player, u.units.loadout[ur], bd)) );
    });

    new_selection.forEach(ns => {
        ns.stats.spawntime_current = 30;
    });

    u.units.selection = ENGINE_Utils.copyObject(new_selection);
    u.units.reserved = ENGINE_Utils.copyObject(new_reserved);
 
    return bd;
};

f.updateOpponent = function(bd){

    var to_be_removed = null;
    var target_unit = null;

    ["left","right"].forEach(side => {

        to_be_removed = null;
        target_unit = null;

        bd.units.forEach(u =>{
            if(u.owner_tag === "opponent" && u.tile_pos === `top_${side}`){
                if(u.stats.health_current <= 0){
                    to_be_removed = u;
                    bd.opponent.spawn_timer[side] = bd.opponent.spawn_timer.max;

                    if(bd.user.combat_score < 999999){
                        bd.user.combat_score += u.stats.reward;
                    };

                    if(SYS_Data.debugging.opponent_spawn_debug === false){
                        bd.opponent.units.reserved.push(ENGINE_Utils.copyObject(ENGINE_Unit.createUnit("opponent", {idname:u.idname}, bd)));
                    };

                }else if(u.stats.health_current >= 1){
                    target_unit = u;
                };
            };
        });

        if(to_be_removed !== null){
            bd = MECHANIC_Events.start("on_death",bd,{source_unit:ENGINE_Utils.copyObject(to_be_removed)});
            bd = MECHANIC_Status.removeFromDeadUnits(bd,to_be_removed.id);
            bd.units = ENGINE_Utils.removeDataFromArray(to_be_removed,bd.units);
        };
        
        if(target_unit === null){
            bd.opponent.spawn_timer[side] -= 1;

            if(bd.opponent.spawn_timer[side] <= 0){
                
                if(SYS_Data.debugging.opponent_spawn_debug === false){
                    bd = spawnUnit("opponent",`top_${side}`,ENGINE_Utils.rng(0,2),bd);

                }else{
                    /* THIS PART OF THE CODE IS FOR DEBUGGING ONLY! */
                    var debug_unit = ENGINE_Utils.copyObject(ENGINE_Unit.createUnit("opponent",{idname:SYS_Data.debugging.opponent_spawn_unit}, bd));
                    debug_unit.tile_pos = `top_${side}`;
                    debug_unit.axis_pos = ENGINE_Physics.convertTile("axis",`top_${side}`);
                    bd.units.push(ENGINE_Utils.copyObject(debug_unit));
                    bd = MECHANIC_Events.start("on_spawn",bd,{source_unit:debug_unit});
                };
            };
        };
    });

    return bd;
};

f.updateUser = function(bd){
    
    //Update health according to commander
    switch(SYS_Data.battle.user.commander){
        case 0:
            bd.user.stats.health_current -= Math.floor((bd.config.battle_time * 0.01) / 2);
        break;
        case 2:
            if(bd.config.battle_time % 30 === 0){
                bd.user.stats.health_current -= 1;
            };
        break;
        case 3:
            if( bd.user.stats.health_current <  bd.user.stats.health_max){
                bd.user.stats.health_current += 1;
            };
        break;
    };
    

    var to_be_removed = null;

    ["left","right"].forEach(side => {

        to_be_removed = null;

        bd.units.forEach(u =>{
            if(u.stats.health_current <= 0 && u.tile_pos === `bottom_${side}`){
                to_be_removed = u;
                bd.user.units.reserved.push(ENGINE_Utils.copyObject(ENGINE_Unit.createUnit("user", {idname:u.idname}, bd)));
            };
        });

        if(to_be_removed !== null){
            bd = MECHANIC_Events.start("on_death",bd,{source_unit:ENGINE_Utils.copyObject(to_be_removed)});
            bd = MECHANIC_Status.removeFromDeadUnits(bd,to_be_removed.id);
            bd.units = ENGINE_Utils.removeDataFromArray(to_be_removed,bd.units);
        };
    });

    return bd;
};


f.activateUser = function(bd,unit_index,tile_id){

    if(tile_id >= 2){ 
        
        var selected_unit = bd.user.units.selection[unit_index];
        var tile = ENGINE_Physics.tile_list[tile_id];
        var to_be_removed = null;
    
        if(selected_unit.stats.spawntime_current <= 0){
            if(bd.units.length >= 1){
                for(var i = 0; i <= bd.units.length - 1;i++){
                    if(bd.units[i].tile_pos === tile){
                        bd.user.units.reserved.push(ENGINE_Utils.copyObject(ENGINE_Unit.createUnit("user",{idname:bd.units[i].idname}, bd)));
                        to_be_removed = bd.units[i];
                        break;
                    };
                };
        
                if(to_be_removed !== null){
                    bd = MECHANIC_Status.removeFromDeadUnits(bd,to_be_removed.id);
                    bd.units = ENGINE_Utils.removeDataFromArray(to_be_removed,bd.units);
                };
    
                bd = spawnUnit("user",tile,unit_index,bd);
                
            };
        };
    };

    return bd;
};

function spawnUnit(player,tile,unit_index,bd){
    var p = bd[player];
    var selected_unit = p.units.selection[unit_index];
    var rand = ENGINE_Utils.rng(0,p.units.reserved.length - 1);
    var reserve_unit = p.units.reserved[rand];

    selected_unit.tile_pos = tile;
    selected_unit.axis_pos = ENGINE_Physics.convertTile("axis",tile);
    bd.units.push(ENGINE_Utils.copyObject(selected_unit));

    if(player === "user"){
        reserve_unit.stats.spawntime_current = reserve_unit.stats.spawntime_max;
    };

    p.units.selection[unit_index] = ENGINE_Utils.copyObject(reserve_unit);
    p.units.reserved = ENGINE_Utils.removeDataFromArray(reserve_unit, p.units.reserved);
    bd = MECHANIC_Events.start("on_spawn",bd,{source_unit:selected_unit});

    return bd;
};

return f;}());var ENGINE_SFX = (function(){var f ={};

// id:projectile.id, 
// image:projectile.image, 
// size:projectile.size, 
// pos:projectile.source_pos
       
f.create = function(bd,params,autoplay_params){
    //autoplay_params is just optional
    //it can be empty or null when creating
    var sfx = {};

    if(typeof(params.image) === "object"){
        var the_image = params.image[params.owner];
    }else {
        var the_image = params.image;
    };
   
    sfx.id = params.id;
    sfx.owner = params.owner;
    sfx.image = the_image;
    sfx.size = params.size;
    sfx.frame_data = f.getSpecificFrame(the_image,0);
    sfx.mode = params.mode;
    sfx.rotation = 0;
    sfx.axis_pos = params.pos;
    sfx.is_dead = false;
    sfx.autoplay = autoplay_params; //{duration, anim_speed, optional(rotation, change_size)}

    bd.sfx.push(sfx);
    return bd;
};

f.cleanup = function(bd){
    var new_sfx = [];

    bd.sfx.forEach(sfx => {
        if(sfx.is_dead === false){
            new_sfx.push(sfx);
        };
    });

    bd.sfx = new_sfx;

    return bd;
};

f.autoplay = function(bd,sfx){
    if(typeof(sfx.autoplay) !== "undefined" && sfx.is_dead === false){
        sfx.autoplay.duration -= 1;

        if(sfx.autoplay.duration % sfx.autoplay.anim_speed === 0){ 
            sfx.frame_data = ENGINE_SFX.updateFrame(sfx.image,sfx.frame_data);
            try { 
                sfx = ENGINE_SFX.animate(sfx,sfx.autoplay.rotation,sfx.autoplay.change_size); 
            }catch(e){}
        };

        if(sfx.autoplay.duration <= 0){
            sfx.is_dead = true;
        };
    };
    return bd;
};

f.animate = function(sfx,rotation,change_size){
   
    if(typeof(rotation) === "number"){
        sfx.rotation += rotation;
    };

    if(typeof(change_size) !== "undefined"){
        if(typeof(change_size.w) === "number"){
            sfx.size.w += change_size.w;
        };
    
        if(typeof(change_size.h) === "number"){
            sfx.size.h += change_size.h;
        };
    };

    return sfx;
};

f.getSpecificFrame = function(img_name,frame_count){
    var img = SYS_DTL.getData("image",{name:img_name});
    return setFrame(img.frame_details,frame_count);
};

f.updateFrame = function(img_name,frame_data,mode){
    var img = SYS_DTL.getData("image",{name:img_name});
    var imgd = img.frame_details;

    switch(mode){
        case "no-loop":
            var f_count = frame_data.count;
            f_count += 1;
            if(f_count > imgd.number_of_frames - 1){
                f_count = imgd.number_of_frames - 1;
            };
            return setFrame(imgd,f_count);
        break;
        default: //default mode is forward
            var f_count = frame_data.count;
            f_count += 1;
            if(f_count > imgd.number_of_frames - 1){
                f_count = 0;
            };
            return setFrame(imgd,f_count);
        break;
    };
};

function setFrame(frame_details,frame_count){
    var img_x,img_y = 0;

    if(frame_count > frame_details.number_of_frames - 1){
        frame_count = frame_details.number_of_frames - 1;
    };
    
    switch(frame_details.frame_flow){
        case "up-to-down":
            img_x = 0;
            img_y = 0 + (frame_details.h * frame_count);
        break;
        case "left-to-right":
            img_x = 0 + (frame_details.w * frame_count);
            img_y = 0;
        break;
        default: img_x = 0; img_y = 0; break;
    };

    return {
        count:frame_count,
        x:img_x, 
        y:img_y, 
        w:frame_details.w, 
        h:frame_details.h
    };
};

return f;}());var ENGINE_Unit = (function(){var f ={};

f.updateUnits = function(bd){

    //Reduce spawn timer for User Player 
    bd.user.units.selection.forEach(u =>{
        u.stats.spawntime_current -= 1;
        if(u.stats.spawntime_current < 0){ u.stats.spawntime_current = 0; }
    });

    //Update AttackTime
    bd = MECHANIC_AttackTime.update(bd);
   
    //Opponent does not have units.selection to update
    bd.user.units.selection.forEach(u =>{ u.stats.attacktime_current = 0; });
    bd.user.units.selection.forEach(u =>{ u.stats.health_current = u.stats.health_max; });

    return bd;
};


f.createUnit = function(player,unit_data,bd){    
    var unit = {};
    var udtl = ENGINE_Utils.copyObject(SYS_DTL.getData("units",{idname:unit_data.idname}));

    unit.owner_tag = player;
    unit.owner_name = bd[player].name;
    unit.id = ENGINE_Utils.idGenerator(15);
    unit.idname = unit_data.idname;
    unit.name = typeof(udtl.name) !== "undefined" ? udtl.name : unit_data.idname;
    unit.skin = udtl.skin;
    unit.size = {w:35,h:35},
    unit.rotation = 0 * Math.PI / 180;
    unit.tile_pos = "";
    unit.axis_pos = "";
    unit.data_storage = {}; //uses by abilities to add custom configs or info
    unit.effects_recieved = []; //an id of Ability Effects to prevent receiving the same effect multiple times.

    //We use this kind of stat format so that in MECHANIC_Stats
    //we can utilize various unit stats easily
    unit.stats = {
        health_current:udtl.stats.health,
        health_max:udtl.stats.health,
        attacktime_current:0, 
        attacktime_max:12000,
        power:udtl.stats.power,
        vigor:udtl.stats.vigor,
        agility:udtl.stats.agility
    };

    if(player === "opponent"){
        unit.stats.reward = Math.floor(udtl.stats.spawn / 2);

    }else if(player === "user"){
        unit.stats.spawntime_current = udtl.stats.spawn;
        unit.stats.spawntime_max = udtl.stats.spawn;
    };

    return unit;
};

return f;}());var ENGINE_Utils = (function(){var f = {};

f.copyObject = function(target_object){
    if(typeof(target_object) === "string"){
        //In case the target object used JSON.stringify
        return JSON.parse(target_object);
    }else{ 
        return JSON.parse(JSON.stringify(target_object));
    };
};

f.removeDataFromArray = function(target,array){
    var newarray = [];
    var i = 0;
    for(;i < array.length;i++){
        if(array[i] !== target){newarray.push(array[i]);};
    };
    return newarray;
};

f.rng = function(min,max){
    var max2 = max + 1;
    var rng_value = Math.floor(Math.random() * Math.floor(max2));
    if(rng_value < min){rng_value = min;};
    return rng_value;
};

f.idGenerator = function(id_length){
    var all_characters =
    ["0","1","2","3","4","5","6","7","8","9",
    "Q","W","E","R","T","Y","U","I","O","P","A","S","D","F","G","H","J","K","L","Z","X","C","V","B","N","M",
    "q","w","e","r","t","y","u","i","o","p","a","s","d","f","g","h","j","k","l","z","x","c","v","b","n","m"];
    var full_id = "";
    var randnumber = 0;
    while(id_length > 0){
        id_length--;
        randnumber = f.rng(1,all_characters.length);
        full_id = full_id.concat(all_characters[randnumber-1]);
    };
    return full_id;
};


f.get_UnitIndex = function(unit_id,unit_list){
    for(var i = 0; i <= unit_list.length - 1;i++){
        if(unit_list[i].id == unit_id){ return i; };
    };
    return null;
};

f.get_SFXIndex = function(sfx_id,sfx_list){
    for(var i = 0; i <= sfx_list.length - 1;i++){
        if(sfx_list[i].id == sfx_id){ return i; };
    };
    return null;
};

return f;}());var MECHANIC_Actions = (function(){var f ={};

f.update = function(bd){

    bd.actions.forEach(ac => {
        if(ac.execution_done === false) { 
            bd = ac.func().update(bd,ac);
        }
    });

    var new_actions = [];

    bd.actions.forEach(ac => {
        if(ac.execution_done === false) { 
            new_actions.push(ac);
        };
    });

    bd.actions = new_actions;

    return bd;
};

f.start = function(bd,params){
    var ac = {};

    ac.source_unit = params.source_unit;
    ac.id = ENGINE_Utils.idGenerator(5);
    ac.execution_done = false;
    ac.configs = ENGINE_Utils.copyObject(params.action_configs); //func wont work here
    ac.func = params.action_configs.func; //for safety of DTL we separate func
    ac.data = {};
    //We need to put an Specific ID to all the Effects
    //so that a unit will not recieved the same effect if triggered
    //multiple times by various targets
    ac.configs.effects.forEach(eff => {
        eff.id = `${ac.id}-${ENGINE_Utils.idGenerator(5)}`;
    });

    var result = ac.func().getData(bd,ac);
    ac.data = result.data;
    bd = result.bd;

    if(ac.data !== null){
        //Dont use ENGINE_Utils.copyObject because .func will not work
        bd.actions.push(ac); 
    };

    return bd;
};

return f;}());var MECHANIC_AttackTime = (function(){var f ={};
/*
    We separated the Attack Time because many mechanics and status
    will be involved in the attack time update in the future
*/

f.update = function(bd){

    if(bd.units.length >= 1){
        bd.units.forEach(u =>{
            
            //Apply Attack and Check Status
            if(MECHANIC_Status.check(bd,u,"disarm") === false){
                u.stats.attacktime_current += u.stats.agility;

                if(MECHANIC_Status.check(bd,u,"slow") === true){
                    u.stats.attacktime_current -= Math.round(u.stats.agility / 2);
                };
            };

            //Perform the Attack Event
            if(u.stats.attacktime_current > u.stats.attacktime_max){
                u.stats.attacktime_current = 0;
                bd = MECHANIC_Events.start("on_attack",bd,{source_unit:u});
            };
        });   
    };
    
    return bd;
};


return f;}());var MECHANIC_Damage = (function(){var f ={};

var modifier_table = { pure:0, normal:0.90, weak:1};

f.applyToUnit = function(bd,params){
    // require params { target_unit, source_unit, modifier, damage }
    var target_u = params.target_unit;
    var source_u = params.source_unit;
    var damage = MECHANIC_SpecialNumbers.compile(bd,source_u,target_u,params.damage);
    var result = null;

    if(target_u !== null){

        bd.units.forEach(unit => {
            if(unit.id === target_u.id){
                target_u = unit;
            };
            if(unit.id === source_u.id){
                source_u = unit;
            };
        });

        result = f.directDamage(bd,target_u,params.modifier,damage);
        target_u = result.unit;
        bd = result.bd;

        if(target_u.stats.health_current <= 0){
            bd = MECHANIC_Events.start("on_kill",bd,{source_unit:target_u});
        };

        target_u.stats = MECHANIC_Stats.limitCheck(target_u.stats);
    };

    return bd;
};

f.applyToUser = function(bd,params){
    // require params { source_unit, modifier, damage }
    var source_u = params.source_unit;
    var damage = MECHANIC_SpecialNumbers.compile(bd,source_u,null,params.damage);
    var result = null;

    if(source_u.owner_tag === "opponent"){
        result = f.directDamage(bd,bd.user,null,damage);
        bd.user = result.unit;
        bd = result.bd;

        bd.user.stats = MECHANIC_Stats.limitCheck(bd.user.stats);
    };
    return bd;
};

f.directDamage = function(bd,target,modifier,amount){

    var data = {};

    if(typeof(target.stats.vigor) !== "undefined"){
        data.vigor = target.stats.vigor;
    }else {
        data.vigor = 0;
    };

    data.damage = isNaN(amount) === false ?  amount : 0;
    data.modifier = typeof(modifier) === "string" ?  modifier : "normal";
    data.reductions = modifier_table[data.modifier]; 
    data.reductions = typeof(data.reductions) !== "undefined" ? data.reductions : modifier_table["normal"];
    data.reduced_damage = data.damage * data.reductions;
    data.unreduced_damage = data.damage - data.reduced_damage;
    data.partial_damage = data.reduced_damage - data.vigor;
    if(data.partial_damage < 0){data.partial_damage = 0; };
    data.full_damage = data.unreduced_damage + data.partial_damage;

    //Activate Status before applying to target health
    if(MECHANIC_Status.check(bd,target,"invulrenable") === true){
        data.full_damage = 0;
    };

    //Trigger on_damage events after applying statuses
    bd = MECHANIC_Events.start("on_calculatedamage",bd,{source_unit:target, damage:data.full_damage});
    
    //Apply the damage now
    target.stats.health_current -= data.full_damage;
    target.stats.health_current = Math.round(target.stats.health_current);

    //User Player can't recieve damage if the commander is 2 since it is a timer
    if(typeof(target.commander) !== "undefined" && bd.user.commander === 2){
        target.stats.health_current += data.full_damage;
        target.stats.health_current = Math.round(target.stats.health_current);
    };

    //Trigger on_damage events after applying statuses
    bd = MECHANIC_Events.start("on_applydamage",bd,{source_unit:target, damage:data.full_damage});

    if(target.owner_tag === "opponent"){
        bd.user.damage_dealt += data.full_damage;
    };

    return {unit:target, bd:bd};
};

return f;}());var MECHANIC_Effects = (function(){var f ={};

f.apply_status = function(bd,p){
    //========= SAMPLE CONFIG =================
    //{type:"status", targets:["enemy"], mode:"add", status:{idname:"",duration:0}},
    //=========================================

    var apply_count = 0;
    
    p.target_units.forEach(unit => {

        apply_count++;

        if(unit !== null){
            if(unit.effects_recieved.indexOf(p.effect.id) <= -1){ 

                var is_enemy = unit.owner_tag === p.action.source_unit.owner_tag ? false : true;

                if(p.effect.targets.indexOf("enemy") >= 0 && is_enemy === true ){ applyToUnit(unit,p.effect.id); };
                if(p.effect.targets.indexOf("owner") >= 0 && is_enemy === false ){ applyToUnit(unit,p.effect.id); };
            };

        };

        if(p.effect.targets.indexOf("source") >= 0 ){ 

            if(p.action.source_unit.effects_recieved.indexOf(p.effect.id + `-${apply_count}`) <= -1){  
                applyToUnit(p.action.source_unit,p.effect.id + `-${apply_count}`); 
            };
        };

        function applyToUnit(the_unit,id){
            p.target_unit = the_unit;
            if(MECHANIC_SpecialCondition.check(bd,p) === true){
                the_unit.effects_recieved.push(id);
                bd = MECHANIC_Status.applyToUnit(bd,{
                    target_unit:the_unit,
                    status:p.effect.status,
                    mode:p.effect.mode,
                });
            };
        };

    });

    return bd;
};

f.apply_damage = function(bd,p){
    //========= SAMPLE CONFIG =================
    //{type:"damage", targets:["user"], modifier:"normal", amount:[["source_unit","power",1]]},
    //=========================================

    var apply_count = 0;

    p.target_units.forEach(unit => {

        apply_count++;

        if(unit !== null){
            if(unit.effects_recieved.indexOf(p.effect.id) <= -1){ 

                var is_enemy = unit.owner_tag === p.action.source_unit.owner_tag ? false : true;

                if(p.effect.targets.indexOf("enemy") >= 0 && is_enemy === true ){ applyToUnit(unit,p.effect.id); };
                if(p.effect.targets.indexOf("owner") >= 0 && is_enemy === false ){ applyToUnit(unit,p.effect.id); };
            };
        }else if(unit === null){
            if(p.action.source_unit.owner_tag === "opponent" && p.effect.targets.indexOf("enemy") >= 0){
                applyToUser(p.effect.id + `-${apply_count}`);
            };
        };

        
        if(p.effect.targets.indexOf("source") >= 0 ){ 
            if(p.action.source_unit.effects_recieved.indexOf(p.effect.id + `-${apply_count}`) <= -1){  
                applyToUnit(p.action.source_unit,p.effect.id + `-${apply_count}`); 
            };
        };

        if(p.effect.targets.indexOf("user") >= 0){
            applyToUser(p.effect.id + `-${apply_count}`);
        };

    });

    function applyToUnit(the_unit,id){
        p.target_unit = the_unit;
        if(MECHANIC_SpecialCondition.check(bd,p) === true){
            the_unit.effects_recieved.push(id);
            bd = MECHANIC_Damage.applyToUnit(bd,{ 
                target_unit:the_unit, 
                source_unit:p.action.source_unit,
                damage:p.effect.amount, 
                modifier:p.effect.modifier});
        };
    };

    function applyToUser(id){
        p.target_unit = null;
        if(MECHANIC_SpecialCondition.check(bd,p) === true){
            if(bd.user.effects_recieved.indexOf(id) <= -1){ 
                bd.user.effects_recieved.push(id);

                bd = MECHANIC_Damage.applyToUser(bd,{ 
                    source_unit:p.action.source_unit,
                    damage:p.effect.amount });
                    
            };
        };
    };

    return bd;
};

f.apply_stats = function(bd,p){
    //========= SAMPLE CONFIG =================
    //{type:"stats", targets:["owner"], mode:"add", stat:"power", amount:100},
    //=========================================

    var apply_count = 0;

    //Some unit's stat amount depends on the target unit. If the stat target is source
    //then the target unit refers to the source unit itself which is wrong because
    //it gets number from the wrong sources. That is why we need to get the target unit
    //for the MECHANICS_SpecialNumbers even if the effect.target is "source".
    //Also if the target unit is null then the MECHANICS_SpecialNumbers will correctly
    //return 0 amount and not from the source_unit. That is also why
    //the_target_unit gets the p.target_units even if it is just null because it will
    //just return 0 if it is really null.
    var the_target_unit = null;

    p.target_units.forEach(unit => {

        apply_count++;
        the_target_unit = unit;

        if(unit !== null){
            if(unit.effects_recieved.indexOf(p.effect.id) <= -1){ 

                var is_enemy = unit.owner_tag === p.action.source_unit.owner_tag ? false : true;

                if(p.effect.targets.indexOf("enemy") >= 0 && is_enemy === true ){ applyToUnit(unit,p.effect.id); };
                if(p.effect.targets.indexOf("owner") >= 0 && is_enemy === false ){ applyToUnit(unit,p.effect.id); };
            };

        };

        if(p.effect.targets.indexOf("source") >= 0 ){ 
            if(p.action.source_unit.effects_recieved.indexOf(p.effect.id + `-${apply_count}`) <= -1){  
                applyToUnit(p.action.source_unit,p.effect.id + `-${apply_count}`); 
            };
        };

    });

    function applyToUnit(the_unit,id){
        p.target_unit = the_unit;
        if(MECHANIC_SpecialCondition.check(bd,p) === true){
            the_unit.effects_recieved.push(id);
            bd = MECHANIC_Stats.applyToUnit(bd,{
                target_unit:the_unit,
                target_stat:p.effect.stat,
                mode:p.effect.mode,
                amount:MECHANIC_SpecialNumbers.compile(bd,p.action.source_unit,the_target_unit,p.effect.amount)
            });
        };
    };

    return bd;

};


return f;}());var MECHANIC_Events = (function(){var f ={};
/*
    We separated the Unit Events because many mechanics and status
    will be involved in the activation of unit events update in the future

    ============ MODES =============
        on_timecount -> ENGINE_Core.run
        on_attack -> MECHANIC_AttackTime
        on_spawn -> ENGINE_Player
        on_addstatus -> MECHANIC_Status function addStatus()
        on_death -> ENGINE_Player
        on_kill -> MECHANIC_Damage.applyToUnit()
    
*/

f.start = function(event,bd,params){
    var udtl = null;

    if(bd.units.length >= 1){
        bd.units.forEach(u => {
            udtl = SYS_DTL.getData("units",{idname:u.idname});
            params.activator_unit = u;

            switch(event){
                case "on_timecount":
                    if(typeof(udtl.func().start_OnTimeCount) === "function"){
                        bd = udtl.func().start_OnTimeCount(bd,params);
                    };
                break;
                case "on_spawn":
                    if(typeof(udtl.func().start_OnSpawn) === "function"){
                        bd = udtl.func().start_OnSpawn(bd,params);
                    };
                break;
                case "on_death":
                    if(typeof(udtl.func().start_OnDeath) === "function"){
                        bd = udtl.func().start_OnDeath(bd,params);
                    };
                break;
                case "on_addstatus":
                    if(typeof(udtl.func().start_OnAddStatus) === "function"){
                        bd = udtl.func().start_OnAddStatus(bd,params);
                    };
                break;
                case "on_attack":
                    if(typeof(udtl.func().start_OnAttack) === "function"){
                        bd = udtl.func().start_OnAttack(bd,params);
                    };
                break;
                case "on_calculatedamage":
                    if(typeof(udtl.func().start_OnCalculateDamage) === "function"){
                        bd = udtl.func().start_OnCalculateDamage(bd,params);
                    };
                break;
                case "on_applydamage":
                    if(typeof(udtl.func().start_OnApplyDamage) === "function"){
                        bd = udtl.func().start_OnApplyDamage(bd,params);
                    };
                break;
            };
        });
    };

    return bd;
};

return f;}());var MECHANIC_SpecialCondition = (function(){var f ={};

f.check = function(bd,params){
    var result = true;

    if(typeof(params.effect.condition) === "object" && params.effect.condition.length >= 1){
        if(result === true){
            result = runCondition(bd,params,params.effect.condition);
        };
    };

    return result;
};

function runCondition(bd,params,condition){

    if(typeof(condition[1]) === "string"){
        var target_u = params.target_unit;
        var source_u = params.action.source_unit;

        switch(condition[1]){
            case ">=":   
                if(target_u != null && source_u !== null){

                    if(typeof(condition[0][0]) !== "string" && typeof(condition[2][0]) !== "string"){
                        var num1 = MECHANIC_SpecialNumbers.compile(bd,source_u,target_u,condition[0]);
                        var num2 = MECHANIC_SpecialNumbers.compile(bd,source_u,target_u,condition[2]);

                        if(num1 >= num2){
                            return true;
                        }else{
                            return false;
                        };

                    }else{
                        console.error(`${params.action.source_unit.idname} condition[0] or [2] is not an array!`);
                        return false;
                    };
                };

            case "<=":   
                if(target_u != null && source_u !== null){

                    if(typeof(condition[0][0]) !== "string" && typeof(condition[2][0]) !== "string"){
                        var num1 = MECHANIC_SpecialNumbers.compile(bd,source_u,target_u,condition[0]);
                        var num2 = MECHANIC_SpecialNumbers.compile(bd,source_u,target_u,condition[2]);

                        if(num1 <= num2){
                            return true;
                        }else{
                            return false;
                        };

                    }else{
                        console.error(`${params.action.source_unit.idname} condition[0] or [2] is not an array!`);
                        return false;
                    };
                };

                return false;
            default:return true;
        };
    };

    return true;
};

return f;}());var MECHANIC_SpecialNumbers = (function(){var f ={};
/*
* FORMAT (Single)= [ [Side, Player/Unit, Stat Target, Percent] ] !Must be inside an array []
* FORMAT (Multiple)= [[Side, Player/Unit, Stat Target, Percent],[Side, Player/Unit, Stat Target, Percent].....]
* EXAMPLE = 10% of Enemy's Current HP ["enemy","player","hc",0.10]
* EXAMPLE = If speed is less than  ally Turn 1 unit speed ["ally",{turn:1},"spd",1]
* EXAMPLE = If speed is less than  enemy's left tile unit speed ["enemy",{tile_pos:"left"},"spd",1]
* EXAMPLE = If power is less than the power of the user's current unit ["ally","current","pwr",1]
*/
f.convert = function(source_unit,target_unit,params){
  
    if(typeof(params) === "object" && params === null){
        return 0;
    }else if(typeof(params) === "number"){ 
        return params; 
    }else if(typeof(params) === "object" && params.length === 3){

        switch(params[0]){
            case "source_unit":
                try{
                    if(typeof(source_unit.stats[params[1]]) !== "undefined"){
                        var total = Math.round(source_unit.stats[params[1]] * parseFloat(params[2]));
                        if(isNaN(total) === false ){ return total; };
                    };
                }catch(e){
                    return 0;
                };
            break;
            case "target_unit":
                try{
                    if(typeof(target_unit.stats[params[1]]) !== "undefined"){
                        var total = Math.round(target_unit.stats[params[1]] * parseFloat(params[2]));
                        if(isNaN(total) === false ){ return total; };
                    };
                }catch(e){
                    return 0;
                };
            break;
        };
    };

    return 0;
};


f.compile = function(bd,source_unit,target_unit,amount){
    //No Status Check will be applied here to avoid complexity
    var total = 0;
    var temp = 0;

    if(typeof(amount) === "number"){
        total += amount;
    }else if(typeof(amount) === "object" && amount.length >= 1){
        amount.forEach((amt)=>{
            if(typeof(amt) === "number"){
                total += amt;
            }else if(typeof(amt) === "object" && amt !== null){
                temp =  f.convert(source_unit,target_unit,amt);
                if(isNaN(temp) === true){ temp = 0;};
                total += temp;
            }else{
                total += 0;
            };
        });
    };

    if(isNaN(total) === true){ total = 0;};
   
    return total;
};

return f;}());var MECHANIC_Stats = (function(){var f ={};

f.applyToUnit = function(bd,params){
    /*TODO Apply Status*/
    /*
        PARAMS
        target_unit = unit object data
        target_stat = string name of the stat
        mode = add/reduce/set
        amount = in numbers
    */
    
    var u = params.target_unit;
    
    if(u !== null){

        bd.units.forEach(unit => {
            if(unit.id === u.id){
                u = unit;
            };
        }); 
        
        if(u.stats[params.target_stat] !== null){
            u.stats[params.target_stat] = operator(u.stats[params.target_stat], params.amount, params.mode);
        };

       u.stats = f.limitCheck(u.stats);
    };
    
    return bd;
};

f.limitCheck = function(stats_list,exceptions){

    var limit_table = {
        health_max:999999,
        health_current:999999,
        power:9999,
        vigor:9999,
        agility:12000
    };
    var limit_amount = 9999;

    if(typeof(exceptions) === "undefined" || exceptions === null){exceptions = []};
    //Lets check stats for safety
    for (const stat of Object.keys(stats_list)) {
        if(exceptions.indexOf(stat) < 0){
            limit_amount = typeof(limit_table[stat]) !== "undefined" ? limit_table[stat] : 999999; 
            stats_list[stat] = Math.round(stats_list[stat]);
            if(stats_list[stat] < 0){ stats_list[stat] = 0; };
            if(stats_list[stat] > limit_amount){ stats_list[stat] = limit_amount; };
        };
    };

    if(typeof(stats_list.health_max) !== "undefined"){
        if(stats_list.health_current > stats_list.health_max){
            stats_list.health_current = stats_list.health_max;
        };
    };

    if(typeof(stats_list.health_current) !== "undefined"){
        stats_list.health_current =Math.round(stats_list.health_current);
    };

    return stats_list;
};

function operator(target_amount,given_amount,mode){
    
    var operator = {add:1, reduce:-1};

    switch(mode){
        case "add": case "reduce":
            target_amount += given_amount * operator[mode];
        break;
        case "set":
            target_amount = given_amount;
        break;
    };
    return target_amount;
};

return f;}());var MECHANIC_Status = (function(){var f ={};

f.applyToUnit = function(bd,params){
    /*TODO Apply Status*/
    /*
        PARAMS
        target_unit = unit object data
        status = name and duration
        mode = add/remove
    */
    
    var target_unit = params.target_unit;

    if(target_unit !== null){

        bd.units.forEach(unit => {
            if(unit.id === target_unit.id){
                target_unit = unit;
            };
        });
        
        switch(params.mode){
            case "add":

                bd = MECHANIC_Events.start("on_addstatus",bd,{source_unit:target_unit});
                
                var existed = false;
                var target_unit_status_count = 0;
                if(bd.status.length >= 1){
                    bd.status.forEach(st => {
                        if(st.target_unit_id === target_unit.id){
                            
                            target_unit_status_count += 1;

                            if(st.idname === params.status.idname){ 
                                existed = true; 
                                st.duration = params.status.duration;
                            };
                        };
                    });
                    if(existed === false){ 
                        if(target_unit_status_count <= 11){
                            bd = addStatus(bd,target_unit,params.status); 
                        };
                    };
                }else{
                    bd = addStatus(bd,target_unit,params.status); 
                };  
            break;

            case "reduce": case "remove":
                var reduction = params.mode === "remove" ? 9999 : params.status.duration;
                if(bd.status.length >= 1){
                    bd.status.forEach(st => {
                        if(st.idname === params.status.idname && st.target_unit_id === target_unit.id){ 
                            st.duration -= reduction;
                        };
                    });
                };
                
            break;
        }
    };
    
    return bd;
};

f.check = function(bd,unit,status_idname){
   
    var check = false;

    if(bd.status.length >= 1){
        
        bd.status.forEach(st => {
            
            if(st.idname === status_idname && st.target_unit_id === unit.id){
                check = true;
             };
        });
    };

    return check;
};

f.removeFromDeadUnits = function(bd,unit_id){ //This is activated at ENGINE_Player.updateOpponent & user

    var new_status = [];

    if(bd.status.length >= 1){
        
        bd.status.forEach(st => {
    
            if(st.target_unit_id !== unit_id){ 
                new_status.push(st); 
            };
        });
    };

    bd.status = ENGINE_Utils.copyObject(new_status);
    
    return bd;
};

f.update = function(bd){

    var new_status = [];

    if(bd.status.length >= 1){
        
        bd.status.forEach(st => {
            st.duration -= 1;

            if(st.duration >= 1){ 

                if(MECHANIC_Status.check(bd,{id:st.target_unit_id},"poison") === true){
                    bd = MECHANIC_Status_Effect.poison(bd,st.target_unit_id);
                };

                new_status.push(st); 
            };
        });
    };

    bd.status = ENGINE_Utils.copyObject(new_status);
    
    return bd;
};

function addStatus(bd,target_unit,config){
    
    var new_st = {    
        id:ENGINE_Utils.idGenerator(6),
        idname:config.idname,
        duration:config.duration,
        target_unit_id:target_unit.id,
        image:`status_${config.idname}`, //for rendering
        pos:target_unit.tile_pos //for rendering
    };

    bd.status.push( ENGINE_Utils.copyObject(new_st)); 

    return bd;
};

return f;}());var MECHANIC_Status_Effect = (function(){var f ={};

f.poison = function(bd,unit_id){

    var result = null;
    bd.units.forEach(u => {
        if(u.id === unit_id){
            result = MECHANIC_Damage.directDamage(bd,u,"pure",MECHANIC_SpecialNumbers.compile(bd,null,u,[["target_unit","health_max",0.02]]));
            bd = result.bd;
            u = result.unit;
        };
    });

    return bd;
};

return f;}());var SC_BATTLE_Controls = (function(){var f ={};

var drag_source = null;

f.update = function(bd){
    
    var us = null, percent = null;

    for(var i = 0; i <= 2; i++){
        us = bd.user.units.selection[i];
        percent = (us.stats.spawntime_current / us.stats.spawntime_max) * 100;
        
        SYS_UI.style([{
            id:`battle_controls_unit_icon_${i}`, 
            background:`url( ${ SYS_DTL.getImage("symbol_" + us.idname) })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"
        }]);

        SYS_UI.style([{
            id:`battle_controls_unit_spawntime_${i}`,  
            backgroundSize: `100% ${percent}%`,
            backgroundRepeat:"no-repeat",
            backgroundPosition:"bottom"
        }]);
    };

    return bd;
};

f.dragStart = function(e){
    drag_source = {};
    drag_source.element = e.target || e.srcElement;
    drag_source.id = drag_source.element.id.split(`battle_controls_unit_button_`)[1];
};

f.dragEnd= function(e) {
    drag_source = null;
}

f.dragEnter= function(e) {
    if (drag_source) {
        var source = e.target || e.srcElement;
        var count = source.id.split(`battle_arena_indicator_`)[1];

        e.preventDefault();

        if(count >= 2){
            SYS_UI.style([{
                id:source.id,
                backgroundColor:"rgba(255, 0, 0, 0.3)"
            }]);
        }else if(count <= 1){
            SYS_UI.style([{
                id:source.id,
                backgroundColor:"transparent"
            }]);
        };
    };
};

f.dragOver= function(e) {
    if (drag_source) {

        var source = e.target || e.srcElement;
        var count = source.id.split(`battle_arena_indicator_`)[1];

        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    
        if(count >= 2){
            SYS_UI.style([{
                id:source.id,
                backgroundColor:"rgba(255, 0, 0, 0.3)"
            }]);
        }else if(count <= 1){
            SYS_UI.style([{
                id:source.id,
                backgroundColor:"transparent"
            }]);
        };
    };
};

f.dragLeave= function(e) {
    if (drag_source) {
        var source = e.target || e.srcElement;
        e.preventDefault();

        SYS_UI.style([{
            id:source.id,
            backgroundColor:"transparent"
        }]);
    }
};

f.drop= function(e) {
    if (drag_source) {

        var source = e.target || e.srcElement;

        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();

        SYS_UI.style([{
            id:source.id,
            backgroundColor:"transparent"
        }]);

        var indicator_id = source.id.split(`battle_arena_indicator_`)[1];
        SYS_Data.battle = ENGINE_Player.activateUser(SYS_Data.battle,drag_source.id,indicator_id);
    }
};

f.ready = function(){
    SYS_Data.battle = ENGINE_Player.readyUser(SYS_Data.battle);
    SYS_Data.battle.user.ready = true;
};

f.surrenderStart = function(){
    SYS_UI.delete({id:"battle_surrender_holder"});
    SYS_Data.battle.config.battle_was_paused = false; 
    SYS_Data.battle.user.surrendered = true;
};

f.surrenderClose = function(){
    SYS_UI.delete({id:"battle_surrender_holder"});
    SYS_Data.battle.config.battle_was_paused = false;
};

f.surrenderShow = function(){
    SI_BATTLE_Controls.createSurrender(SYS_UI.body);
    SYS_Data.battle.config.battle_was_paused = true;
};

return f;}());var SC_BATTLE_Render = (function(){var f ={};

/* ====== ARENA COORDINATES =======
         0     25    50      75     100
       x-50           x0             x50
        -----------------------------
    y50 |                           |    
        |                           |
    y0  |                           |
        |                           |
   y-50 |                           |
        -----------------------------
    NOTES: In the ENGINE player1 will always be on top
           and player2 will always be on bottom
*/

var c = { canvas:null, size:null, ctx:null, ratio:{w:null, h:null} };

f.initialize = function(){
    //Set up the canvas
    c.canvas = document.getElementById(SYS_Data.game.battle_canvas);
    c.size = { w:c.canvas.clientWidth, h:c.canvas.clientHeight };
    c.canvas.width = Math.floor(c.size.w * SYS_Data.game.window_scale); 
    c.canvas.height = Math.floor(c.size.h * SYS_Data.game.window_scale); 
    c.ctx = c.canvas.getContext('2d');
};


f.update = function(bd){
    if(document.getElementById("battle_main") != null){   
        try{
            c.ctx.clearRect(0,0,c.canvas.width,c.canvas.height);
            c.ratio = c.canvas.width / bd.config.arena_size.w;

            //Set unit info to default hidden
            for(var i = 0; i <= 3; i ++){
                SYS_UI.style([{
                    id:`battle_unitinfo_main_${i}`,
                    visibility:"hidden"
                }]);
            };

            //Clean the status icons
            for(var s1 = 0; s1 <= 3; s1 ++){
                for(var s2 = 0; s2 <= 11; s2 ++){
                    SYS_UI.style([{
                        id:`battle_arena_status_${s1}_box_${s2}`,
                        visibility:"hidden"
                    }]);
                };
            };

            renderPlayer();

            if(bd.status.length > 0){
                var status_count = [-1,-1,-1,-1]; //start at -1 because first entry starts at 0
                bd.status.forEach(status => {
                    status_count = renderStatus(status,status_count);
            });};

            if(bd.units.length > 0){
                bd.units.forEach(unit => {
                    renderInfo(unit);
                    renderObject(unit,"unit");
               });
            };

            if(bd.sfx.length > 0){
                bd.sfx.forEach(sfx => {
                    if(sfx.is_dead === false){
                        renderObject(sfx,"sfx");
            };});};

        }catch(err){ console.log(err); SC_BATTLE.endUpdate(); }; 
    };
};

function renderObject(object_data,tag){
    var the_image = {
        unit:SYS_DTL.getImage(object_data.skin),
        sfx:SYS_DTL.getImage(object_data.image),
    };

    var object = {
        fx:null, fy:null, fw:null, fh:null,
        x: object_data.axis_pos.x * c.ratio,
        y: object_data.axis_pos.y * c.ratio,
        w: object_data.size.w * c.ratio,
        h: object_data.size.h * c.ratio,
        a: object_data.rotation,//rotation value must be in radians
        image:the_image[tag]
    };

    if(typeof(object_data.frame_data) !== "undefined"){
        object.fx = object_data.frame_data.x;
        object.fy = object_data.frame_data.y;
        object.fw = object_data.frame_data.w;
        object.fh = object_data.frame_data.h;
    };

    var canvas_centerx = c.canvas.width / 2;
    var canvas_centery = c.canvas.height / 2;
    object.x = object.x + canvas_centerx;
    object.y = Math.abs(object.y - canvas_centery);
        
    //Get the image
    var image = new Image();
    image.src = object.image;

   //Draw the image
    c.ctx.save();
    c.ctx.translate(object.x, object.y);
    c.ctx.rotate(object.a);
    if(typeof(object_data.frame_data) !== "undefined"){ 
        c.ctx.drawImage(image,object.fx,object.fy, object.fw, object.fh,-object.w / 2, -object.h / 2, object.w, object.h);
    }else{ 
        c.ctx.drawImage(image,-object.w / 2, -object.h / 2, object.w, object.h);
    };
    c.ctx.restore();
    
};

function renderInfo(unit){
    var tile = {top_left:0,top_right:1,bottom_left:2,bottom_right:3};

    SYS_UI.style([{
        id:`battle_unitinfo_main_${tile[unit.tile_pos]}`,
        visibility:"visible"
    }]);

    SYS_UI.progressBar({
        id:`battle_unitinfo_health_${tile[unit.tile_pos]}`,
        show_text:true,
        current: unit.stats.health_current,
        max: unit.stats.health_max,
    });

    SYS_UI.progressBar({
        id:`battle_unitinfo_attacktime_${tile[unit.tile_pos]}`,
        show_text:true,
        current: unit.stats.attacktime_current,
        max: unit.stats.attacktime_max,
    });

    document.getElementById(`battle_unitinfo_name_${tile[unit.tile_pos]}`).innerHTML = unit.name.toUpperCase();
    document.getElementById(`battle_unitinfo_attacktime_${tile[unit.tile_pos]}_bar_txt`).innerHTML = unit.stats.agility;
    document.getElementById(`battle_unitinfo_stat_left_text_${tile[unit.tile_pos]}`).innerHTML = unit.stats.power;
    document.getElementById(`battle_unitinfo_stat_right_text_${tile[unit.tile_pos]}`).innerHTML = unit.stats.vigor;
    
};

function renderPlayer(){
    document.getElementById(`battle_userinfo_name`).innerHTML = SYS_Data.battle.user.name;
    document.getElementById(`battle_userinfo_score`).innerHTML = SYS_Data.battle.user.combat_score;

    SYS_UI.progressBar({
        id:`battle_userinfo_health`,
        show_text:true,
        current: SYS_Data.battle.user.stats.health_current,
        max: SYS_Data.battle.user.stats.health_max
    }); 
};

function renderStatus(status,status_count){
    var tile = {top_left:0,top_right:1,bottom_left:2,bottom_right:3};
    var get_tile = tile[status.pos];
    status_count[get_tile] += 1;
    var get_box = status_count[get_tile];
    var bottom_box = [8,9,10,11,4,5,6,7,0,1,2,3];
    
    if(get_tile >= 2){
        get_box = bottom_box[get_box];
    };

    SYS_UI.style([{
        id:`battle_arena_status_${get_tile}_box_${get_box}`, 
        visibility:"visible",
        background:`url( ${ SYS_DTL.getImage(status.image) })`,
        backgroundSize: "100% 100%",
        backgroundRepeat:"no-repeat",
        backgroundPosition:"center",
        opacity:"0.7",
    }]);

    return status_count;
};

return f;}());var SC_INITIALIZER = (function(){var f = {}

var transition_timer = null;
var transition_count = 1;
var loadcount = 0;
var loadmax = 0;

f.initialize = function(){
    SI_INITIALIZER.initialize();
    transition();
};

f.imageDonePreloading = function(){
    //This is activated on the img onload attribute
    loadcount += 1;

    SYS_UI.progressBar({
        id:`initializer_wait_bar`,
        current: loadcount,
        max: loadmax
    });

    if(loadcount >= loadmax){
        //Done loading so we now proceed to menu
        var st = setTimeout(()=>{
            SC_MENU.initialize();
            clearTimeout(st);
        },1000);
    };
};

function preloadImages(){
    SI_INITIALIZER.createWait("initializer_screen_holder");
    loadcount = 0; loadmax = 0;
    var st = setTimeout(()=>{
        var image_list = SYS_DTL.getData("image","name");
        loadmax = image_list.length;
        image_list.forEach((img)=>{
            SI_INITIALIZER.createPreload( image_list.length, img,"initializer_main_div");
        });
        clearTimeout(st);
    },100);
};

function transition(){
    SI_INITIALIZER.createSplash("initializer_screen_holder");
    transition_count = 1;
    transition_timer = setInterval(function(){
        transition_count = transition_count - 0.01;

       SYS_UI.style([{
            id:"initializer_splashscreen",
            opacity:`${transition_count}`
        }]);

        if(transition_count <= 0){
            clearInterval(transition_timer);
            preloadImages();
    };},10);
};



return f;}());var SC_MENU = (function(){var f ={};

f.initialize = function(){
    SI_MENU.initialize();
};

f.play = function(){
    //We need to reset first the BATTLE DATA
    SYS_Data.battle = SYS_Utils.copyObject(SYS_Data.battle_original_copy);
    
    //Let the user edit the units
    SC_PREPARATION.initialize();
};

return f;}());var SC_PREPARATION = (function(){var f ={};

f.initialize = function(){
    //After the data then only initialize interface
    SI_PREPARATION.initialize();
    //Put starting data
    initialPlayerData("opponent");
    initialPlayerData("user");
    //Render any data
    renderData();
};

f.start = function(){
    if(SYS_Data.battle.user.name.length <= 0){SYS_Data.battle.user.name = "Human Player"};
    SC_BATTLE.initialize();
};

f.setName = function(){
    var pname = document.getElementById(`preparation_profile_name_input`).value;
    SYS_Data.battle.user.name = pname.slice(0,12);
};

f.setCommander = function(button_index){
    for(var i = 0; i <= 3; i++){
        SYS_UI.style([{
            id:`preparation_profile_commander_button_${i}`, 
            border:"0px"
        }]);
    };

    SYS_Data.battle.user.commander = button_index;

    SYS_UI.style([{
        id:`preparation_profile_commander_button_${button_index}`, 
        border:"4px solid red"
    }]);
};

f.randomize = function(tag){
    SYS_Data.battle[tag].units.loadout = [];
    initialPlayerData(tag);
    renderData();
};

f.activateEditor = function(tag,button_index){
    SC_PREPARATION_Editor.initialize(tag,button_index);
};

f.closeEditor = function(){
    renderData();
};

function initialPlayerData(tag){

    var unit_list = SYS_DTL.getData("units");
    var loadout = [];
    var unit = 0;

    //====================================================================

    if(tag === "opponent" && SYS_Data.battle.opponent.units.loadout.length <= 0){
        do{
            unit = SYS_Utils.rng(0,unit_list.length - 1);
            if(loadout.indexOf(unit) <= -1){
                loadout.push(unit);
            };
        }while(loadout.length < 12);
    
        loadout.forEach(ul => {
            SYS_Data.battle.opponent.units.loadout.push(SYS_Utils.copyObject(unit_list[ul]));
        });
    };

    if(tag === "user" && SYS_Data.battle.user.units.loadout.length <= 0){
        do{
            unit = SYS_Utils.rng(0,unit_list.length - 1);
            if(loadout.indexOf(unit) <= -1){
                loadout.push(unit);
            };
        }while(loadout.length < 8);
    
        loadout.forEach(ul => {
            if(SYS_Data.debugging.user_loadout_debug === false){
                SYS_Data.battle.user.units.loadout.push(SYS_Utils.copyObject(unit_list[ul]));
            }else {
                SYS_Data.battle.user.units.loadout.push(SYS_Utils.copyObject(unit_list[SYS_Data.debugging.user_loadout_unit]));
            };
        });
    };

};

function renderData(){

    f.setCommander(SYS_Data.battle.user.commander);

    var unit = null;

    for(var i1 = 0; i1 <= 11; i1++){

        unit = SYS_Data.battle.opponent.units.loadout[i1];

        SYS_UI.style([{
            id:`preparation_loadout_opponent_unit_icon_${i1}`, 
            background:`url( ${ SYS_DTL.getImage("symbol_" + unit.idname) })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"
        }]);
    };

    for(var i2 = 0; i2 <= 7; i2++){

        unit = SYS_Data.battle.user.units.loadout[i2];

        SYS_UI.style([{
            id:`preparation_loadout_user_unit_icon_${i2}`, 
            background:`url( ${ SYS_DTL.getImage("symbol_" + unit.idname) })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"
        }]);
    };
};

return f;}());var SC_PREPARATION_Editor = (function(){var f ={};

var the_tag;
var the_button_index;
var the_loadout = null;
var the_unit = null;
var the_index = 0;
var unit_list = null;
var the_page = 0;

f.initialize = function(tag,button_index){

    SI_PREPARATION_Editor.initialize();

    if(tag === "opponent"){
        document.getElementById(`preparation_editor_top_text`).innerHTML = "ENEMY'S LOADOUT";
        the_loadout = SYS_Data.battle.opponent.units.loadout;
    }else if(tag === "user"){
        document.getElementById(`preparation_editor_top_text`).innerHTML = "YOUR LOADOUT";
        the_loadout = SYS_Data.battle.user.units.loadout;
    };

    the_tag = tag;
    the_button_index = button_index;
    unit_list = ENGINE_Utils.copyObject(SYS_DTL.getData("units"));
    the_unit = the_loadout[button_index];
    the_index = getIndex(the_unit);
    the_page = Math.floor(the_index / 6);

    updateInfo(the_unit);
    updateSelection();
};

f.select = function(button_index){

    var target = SYS_Utils.copyObject(unit_list[(the_page * 6)+ button_index]);

    if(checkInLoadout(target) === false){
        the_unit = target;
        the_index = getIndex(the_unit);
        the_page = Math.floor(the_index / 6);
    
        SYS_Data.battle[the_tag].units.loadout[the_button_index] = the_unit;
    
        updateSelection();
    };

    updateInfo(target);
};

f.close = function(){
    SYS_UI.delete({id:"preparation_editor_main_holder"});
    SC_PREPARATION.closeEditor();
};

f.selectionControl = function(action){
   
    var max_page = Math.floor(unit_list.length / 6);
    var current_page = the_page + 1;

    if(unit_list.length % 6 >= 1){ max_page += 1; };

    switch(action){
        case "prev":
            current_page -= 1;
            if(current_page <= 0){
                current_page = max_page;
            };
        break;
        case "next":
            current_page += 1;
            if(current_page > max_page){
                current_page = 1;
            };
        break;
    };

    the_page = current_page - 1;
    updateSelection();
};

function updateInfo(target){

    var udtl = ENGINE_Utils.copyObject(SYS_DTL.getData("units",{idname:target.idname}));
    var unit_name = typeof(udtl.name) !== "undefined" ? udtl.name : target.idname;

    SYS_UI.style([{
        id:"preparation_editor_info_pic_symbol", 
        background:`url( ${ SYS_DTL.getImage("symbol_" + target.idname) })`,
        backgroundSize: "100% 100%",
        backgroundRepeat:"no-repeat",
        backgroundPosition:"center"
    },{
        id:"preparation_editor_info_pic_skin", 
        background:`url( ${ SYS_DTL.getImage(target.skin) })`,
        backgroundSize: "100% 100%",
        backgroundRepeat:"no-repeat",
        backgroundPosition:"center"
    }]);

    document.getElementById(`preparation_editor_descleft_name`).innerHTML = unit_name.toUpperCase();
    document.getElementById(`preparation_editor_descleft_health`).innerHTML = "Health: " + udtl.stats.health;
    document.getElementById(`preparation_editor_descleft_power`).innerHTML = "Power: " + udtl.stats.power;
    document.getElementById(`preparation_editor_descleft_vigor`).innerHTML = "Vigor: " + udtl.stats.vigor;
    document.getElementById(`preparation_editor_descleft_agility`).innerHTML = "Agility: " + udtl.stats.agility;
    document.getElementById(`preparation_editor_descleft_attack_range`).innerHTML = "ATK Range: " + udtl.attack.range;
    document.getElementById(`preparation_editor_descleft_attack_type`).innerHTML = "ATK Type: " + udtl.attack.type.toUpperCase();
    document.getElementById("preparation_editor_info_descright_ability").innerHTML = `ABILITY EFFECT: \n ${udtl.ability}`;
};

function updateSelection(){

    var target = null;
    var button_bg = "background_selection_type2";
    var max_page = Math.floor(unit_list.length / 6);

    if(unit_list.length % 6 >= 1){ max_page += 1; };
    document.getElementById(`preparation_editor_selection_controls_text`).innerHTML = `${the_page + 1}/${max_page}`;
   
    for(var i = 0; i <= 5; i++){

        target = unit_list[(the_page * 6)+ i];

        if(typeof(target) !== "undefined"){

            //Set default bg
            button_bg = "background_selection_type2";
            //Set selected bg
            if(target.idname === the_unit.idname){
                button_bg = "background_selection_type1";
            };
            //Set included in loadout bg
            if(target.idname !== the_unit.idname && checkInLoadout(target) === true){
                button_bg = "background_selection_type3";
            };

            SYS_UI.style([{
                id:`preparation_editor_selection_list_button_${i}`, 
                visibility:"visible",
                background:`url( ${ SYS_DTL.getImage( button_bg ) })`,
                backgroundSize: "100% 100%",
                backgroundRepeat:"no-repeat",
                backgroundPosition:"center"
            },{
                id:`preparation_editor_selection_list_icon_${i}`, 
                visibility:"visible",
                background:`url( ${ SYS_DTL.getImage("symbol_" + target.idname) })`,
                backgroundSize: "100% 100%",
                backgroundRepeat:"no-repeat",
                backgroundPosition:"center"
            }]);

        }else if(typeof(target) === "undefined"){
            SYS_UI.style([{
                id:`preparation_editor_selection_list_button_${i}`, 
                visibility:"hidden"
            },{
                id:`preparation_editor_selection_list_icon_${i}`, 
                visibility:"hidden"
            }]);
        };
    };

};

function getIndex(target){

    for(var i = 0; i <= unit_list.length - 1;i++){
        if(unit_list[i].idname === target.idname){
            return i;
        };
    };

    return 0;
};

function checkInLoadout(target){

    for(var i = 0; i <= the_loadout.length - 1;i++){
        if(the_loadout[i].idname === target.idname){
            return true;
        };
    };

    return false;
};

return f;}());var SC_RESULT = (function(){var f ={};

f.initialize = function(bd){
    var score = calculate(bd);
    SI_RESULT.initialize(bd,score);
};

f.continue = function(){ 
    SC_MENU.initialize();
};

function calculate(bd){

    var total = Math.floor(bd.user.damage_dealt / 20) + bd.user.combat_score + Math.floor(bd.config.battle_time / 10);
    total = isNaN(total) === true ? 0 : total;
    if(total < 0 ){ total = 0; };

    return {
        damage_dealt:`Damage Dealt: +${Math.floor(bd.user.damage_dealt / 20)}`,
        combat_score:`Combat Score: +${bd.user.combat_score}`,
        time:`Time Survived: +${Math.floor(bd.config.battle_time / 10)}`,
        total_points:`SCORE: ${total}`
    };

};



return f;}());var SI_BATTLE_Arena = (function(){var f ={};

f.unitinfo_count = -1;

f.createUnitInfo = function(div_holder,column){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.main = {w:v.holder_w / 2, h:v.holder_h};
    v.info = {w:v.main.w * 0.85, h:v.main.h * 0.45};
    v.name = v.main.h * 0.18;
    v.stats = v.info.w * 0.25;
    v.bars = v.info.w * 0.48;

    v.health = v.info.h * 0.50;
    v.health_text = (v.info.h + v.health) * 0.18
    v.attacktime = v.info.h * 0.50;
    v.attacktime_text = (v.info.h + v.attacktime) * 0.20

    v.stats_text = (v.stats + v.info.h) * 0.18;
    v.name_text = (v.info.w + (v.name * 0.08)) * 0.10;

    for(var i = 0; i <= 1; i ++){

        f.unitinfo_count++;

            SYS_UI.create([{
                type:"div", 
                id:`battle_unitinfo_main_${f.unitinfo_count}`,
                attach:div_holder,
                style:{
                    width: v.main.w.toString() + "px",
                    height:v.main.h.toString() + "px",
                    display:"flex",
                    flexDirection:"column",
                    justifyContent:"center",
                    alignItems:"center",
                    background:`url( ${ SYS_DTL.getImage("background_white_type2") })`,
                    backgroundSize: "100% 90%",
                    backgroundRepeat:"no-repeat",
                    backgroundPosition:"center"} 
            },{
                type:"div", 
                id:`battle_unitinfo_name_holder_${f.unitinfo_count}`,
                attach:`battle_unitinfo_main_${f.unitinfo_count}`,
                style:{
                    width: v.info.w.toString() + "px",
                    height:v.name.toString() + "px",
                    display:"flex",
                    flexDirection:"row",
                    justifyContent:"center",
                    alignItems:"center",
                    flexWrap:"wrap"}
            },{
                type:"p",
                id:`battle_unitinfo_name_${f.unitinfo_count}`,
                attach:`battle_unitinfo_name_holder_${f.unitinfo_count}`,
                text:`NAME`,
                style:{
                    fontWeight:"bold",
                    fontSize:v.name_text.toString() + "px",
                    color:"black"}
            },{
                type:"div", 
                id:`battle_unitinfo_${f.unitinfo_count}`,
                attach:`battle_unitinfo_main_${f.unitinfo_count}`,
                style:{
                    width: v.info.w.toString() + "px",
                    height:v.info.h.toString() + "px",
                    display:"flex",
                    flexDirection:"row",
                    justifyContent:"center",
                    alignItems:"center",
                    flexWrap:"wrap"}
            },{
                type:"div", 
                id:`battle_unitinfo_stat_left_${f.unitinfo_count}`,
                attach:`battle_unitinfo_${f.unitinfo_count}`,
                style:{
                    backgroundColor:"rgb(140, 0, 0)",
                    width: v.stats.toString() + "px",
                    height:v.info.h.toString() + "px",
                    display:"flex",
                    flexDirection:"row",
                    justifyContent:"center",
                    alignItems:"center",
                    background:`url( ${ SYS_DTL.getImage("background_power") })`,
                    backgroundSize: "100% 90%",
                    backgroundRepeat:"no-repeat",
                    backgroundPosition:"center"} 
            },{
                type:"div", 
                id:`battle_unitinfo_bars_${f.unitinfo_count}`,
                attach:`battle_unitinfo_${f.unitinfo_count}`,
                style:{
                    width: v.bars.toString() + "px",
                    height:v.info.h.toString() + "px",
                    display:"flex",
                    flexDirection:"column",
                    justifyContent:"center",
                    alignItems:"center"}
            },{
                type:"div", 
                id:`battle_unitinfo_stat_right_${f.unitinfo_count}`,
                attach:`battle_unitinfo_${f.unitinfo_count}`,
                style:{
                    backgroundColor:"rgb(0, 0, 120)",
                    width: v.stats.toString() + "px",
                    height:v.info.h.toString() + "px",
                    display:"flex",
                    flexDirection:"row",
                    justifyContent:"center",
                    alignItems:"center",
                    background:`url( ${ SYS_DTL.getImage("background_vigor") })`,
                    backgroundSize: "100% 90%",
                    backgroundRepeat:"no-repeat",
                    backgroundPosition:"center"} 
            },{
                type:"p",
                id:`battle_unitinfo_stat_left_text_${f.unitinfo_count}`,
                attach:`battle_unitinfo_stat_left_${f.unitinfo_count}`,
                text:`0000`,
                style:{
                    fontWeight:"bold",
                    fontSize:v.stats_text.toString() + "px",
                    color:"white"}
            },{
                type:"p",
                id:`battle_unitinfo_stat_right_text_${f.unitinfo_count}`,
                attach:`battle_unitinfo_stat_right_${f.unitinfo_count}`,
                text:`0000`,
                style:{
                    fontWeight:"bold",
                    fontSize:v.stats_text.toString() + "px",
                    color:"white"}  
            },{
                type:"div", 
                id:`battle_unitinfo_health_holder_${f.unitinfo_count}`,
                attach:`battle_unitinfo_bars_${f.unitinfo_count}`,
                style:{
                    width: v.bars.toString() + "px",
                    height:v.health.toString() + "px",
                    display:"flex",
                    flexDirection:"row",
                    justifyContent:"center",
                    alignItems:"center"}
            },{
                type:"div", 
                id:`battle_unitinfo_attacktime_holder_${f.unitinfo_count}`,
                attach:`battle_unitinfo_bars_${f.unitinfo_count}`,
                style:{
                    width: v.bars.toString() + "px",
                    height:v.attacktime.toString() + "px",
                    display:"flex",
                    flexDirection:"row",
                    justifyContent:"center",
                    alignItems:"center"}
            }]);

            SYS_UI.progressBar({
                id:`battle_unitinfo_health_${f.unitinfo_count}`,
                show_text:true,
                attach:`battle_unitinfo_health_holder_${f.unitinfo_count}`,
                width: v.bars.toString() + "px",
                height:v.health.toString() + "px",
                bgcolor:"black",
                color:"rgb(0, 100, 20)",
                text_color:"white",
                font_size:v.health_text,
                current:99999,
                max:99999
            });

            SYS_UI.progressBar({
                id:`battle_unitinfo_attacktime_${f.unitinfo_count}`,
                show_text:true,
                attach:`battle_unitinfo_attacktime_holder_${f.unitinfo_count}`,
                width: v.bars.toString() + "px",
                height:v.attacktime.toString() + "px",
                bgcolor:"black",
                color:"rgb(170, 60, 0)",
                text_color:"white",
                font_size:v.attacktime_text,
                current:100,
                max:100
            });
    };
};

f.createIndicator = function(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.tile = {w:(v.holder_w / 2), h:v.holder_h / 2, onClick:""};
    var indicator = null;

    for(var i = 0; i <= 3; i ++){
        SYS_UI.create([{
            type:"div", 
            id:`battle_arena_indicator_${i}`, 
            attach:div_holder,
            style:{
                width: v.tile.w.toString() + "px",
                height:v.tile.h.toString() + "px",
                display:"flex",
                flexDirection:"column",
                justifyContent:"center",
                alignItems:"center"}
        }]);

        indicator = document.getElementById(`battle_arena_indicator_${i}`);
        indicator.addEventListener('dragenter', SC_BATTLE_Controls.dragEnter, false);
        indicator.addEventListener('dragover', SC_BATTLE_Controls.dragOver, false);
        indicator.addEventListener('dragleave', SC_BATTLE_Controls.dragLeave, false);
        indicator.addEventListener('drop', SC_BATTLE_Controls.drop, false);
    };
};

f.createCanvas = function(div_holder){
    SYS_UI.clear({id:div_holder});
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.scale =  window.devicePixelRatio;  
    v.canvas_attrib_size = {
        w: Math.floor(v.holder_w * v.scale), 
        h:Math.floor(v.holder_h * v.scale)};

    SYS_UI.create([{
        type:"canvas", 
        id:SYS_Data.game.battle_canvas, 
        attach:div_holder,
        style:{
            width: v.holder_w.toString() + "px",
            height: v.holder_h.toString() + "px"},
        attrib:{
            width:v.canvas_attrib_size.w,
            height: v.canvas_attrib_size.h }
    }]);
};

f.createStatus = function(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.tile = {w:(v.holder_w / 2), h:v.holder_h / 2};
    v.padding = v.tile.w * 0.05;

    for(var i = 0; i <= 3; i ++){
        SYS_UI.create([{
            type:"div", 
            id:`battle_arena_status_${i}`, 
            attach:div_holder,
            style:{
                width: v.tile.w.toString() + "px",
                height:v.tile.h.toString() + "px",
                padding:v.padding.toString() + "px",
                display:"flex",
                flexDirection:"row",
                justifyContent:"space-around",
                alignItems:"center",
                flexWrap:"wrap"}
        }]);

        createStatusBox(`battle_arena_status_${i}`);
    };
};

function createStatusBox(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.box = (v.holder_w / 4) * 0.70;

    for(var i = 0; i <= 11; i ++){
        SYS_UI.create([{
            type:"div", 
            id:`${div_holder}_box_${i}`, 
            attach:div_holder,
            style:{
                width: v.box.toString() + "px",
                height:v.box.toString() + "px",
                margin:"0.5%",
                display:"flex",
                flexDirection:"column",
                justifyContent:"center",
                alignItems:"center"}
        }]);
    };
};
return f;}());var SI_BATTLE_Controls = (function(){var f ={};

f.createUnits = function(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.button = v.holder_h * 0.85;
    v.icon = v.button * 0.75;
    var unit = null;

    for(var index = 0; index <= 2; index ++){

        SYS_UI.create([{
            type:"div", 
            id:`battle_controls_unit_button_${index}`, 
            attach:div_holder,
            style:{
                width: v.button.toString() + "px",
                height:v.button.toString() + "px",
                marginLeft:"1.5%",
                marginRight:"1.5%",
                display:"flex",
                flexDirection:"row",
                justifyContent:"center",
                alignItems:"center",
                background:`url( ${ SYS_DTL.getImage("background_white_type3") })`,
                backgroundSize: "100% 100%",
                backgroundRepeat:"no-repeat",
                backgroundPosition:"center"},
            attrib:{
                    draggable:true},
        },{
            type:"div", 
            id:`battle_controls_unit_icon_${index}`, 
            attach:`battle_controls_unit_button_${index}`, 
            style:{
                width: v.icon.toString() + "px",
                height:v.icon.toString() + "px",
                background:`url( ${ SYS_DTL.getImage("default") })`,
                backgroundSize: "100% 100%",
                backgroundRepeat:"no-repeat",
                backgroundPosition:"center"}, 
        },{
            type:"div", 
            id:`battle_controls_unit_spawntime_${index}`, 
            attach:`battle_controls_unit_button_${index}`, 
            style:{
                width: v.button.toString() + "px",
                height:v.button.toString() + "px",
                position:"absolute",
                background:`url( ${ SYS_DTL.getImage("background_spawntime") })`,
                backgroundSize: "100% 70%",
                backgroundRepeat:"no-repeat",
                backgroundPosition:"bottom"},
        }]);

        unit = document.getElementById(`battle_controls_unit_button_${index}`);
        unit.addEventListener('dragstart', SC_BATTLE_Controls.dragStart, false);
        unit.addEventListener('dragend', SC_BATTLE_Controls.dragEnd, false);
    };
};

f.createOptions = function(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.button = v.holder_h * 0.35;

    SYS_UI.create([{
        type:"div", 
        id:`battle_controls_settings_button`, 
        attach:div_holder,
        style:{
            width: v.button.toString() + "px",
            height:v.button.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center",
            background:`url( ${ SYS_DTL.getImage("button_settings") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"},
        attrib:{
                onclick:`SC_BATTLE_Controls.surrenderShow();`},
    }]);
};

f.createSurrender = function(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.ratio = v.holder_w / v.holder_h;
    v.main = {w:0, h:0, r:0, t:0, l:0};
    //=========================================================
    if (v.ratio >= 0.60) { v.main.r = 0.60;
    }else if(v.ratio >= 0.40 && v.ratio < 0.60 ) { v.main.r = 0.80;
    } else if (v.ratio < 0.40) { v.main.r = 0.95; };
    v.main.w = v.holder_w * v.main.r;
    v.main.h = v.main.w * 0.75;
    v.main.t = Math.floor((v.holder_h - v.main.h) / 2);
    v.main.l = Math.floor((v.holder_w - v.main.w) / 2);
    //=========================================================
    v.button = {w:(v.main.h * 0.30) * 3, h:v.main.h * 0.30};
    v.button2 = {w:(v.main.h * 0.22) * 3, h:v.main.h * 0.22};

    SYS_UI.create([{
        type:"div", 
        id:"battle_surrender_holder", 
        attach:div_holder,
        style:{
            width: v.holder_w.toString() + "px",
            height: v.holder_h.toString() + "px",
            position:"absolute",
            backgroundColor:"rgba(50,50,50,0.5)",
            zIndex:9999} //zIndex 1 is for player health bar text so we set it to 2
    },{
        type:"div", 
        id:"battle_surrender_main", 
        attach:"battle_surrender_holder",
        style:{
            width: v.main.w.toString() + "px",
            height: v.main.h.toString() + "px",
            marginTop:v.main.t.toString() + "px",
            marginLeft:v.main.l.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center",
            background:`url( ${ SYS_DTL.getImage("background_white_type4") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",}
    },{
        type:"div", 
        id:"battle_surrender_activate_button", 
        attach:"battle_surrender_main",
        style:{
            width: v.button.w.toString() + "px",
            height: v.button.h.toString() + "px",
            margin:"2%",
            background:`url( ${ SYS_DTL.getImage("button_surrender") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"},
        attrib:{
            onclick:"SC_BATTLE_Controls.surrenderStart();"},
    },{
        type:"div", 
        id:"battle_surrender_back_button", 
        attach:"battle_surrender_main",
        style:{
            width: v.button2.w.toString() + "px",
            height: v.button2.h.toString() + "px",
            margin:"4%",
            background:`url( ${ SYS_DTL.getImage("button_back") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"},
        attrib:{
            onclick:"SC_BATTLE_Controls.surrenderClose();"},
    }]);
};

return f;}());var SI_BATTLE_UserInfo = (function(){var f ={};

f.createUserInfo_Left = function(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.profile = {w:(v.holder_h * 0.90) * 2, h:v.holder_h * 0.90};

    SYS_UI.create([{
        type:"div", 
        id:`battle_userinfo_profile`, 
        attach:div_holder,
        style:{
            width: v.profile.w.toString() + "px",
            height:v.profile.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center",
            background:`url( ${ SYS_DTL.getImage(`commander_${SYS_Data.battle.user.commander}`) })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}
    }]);
};

f.createUserInfo_Center = function(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.name = (v.holder_w + v.holder_h) * 0.07;
    v.health_holder = {  w:v.holder_w * 0.95, h: v.holder_h * 0.50 };
    v.health_text = (v.health_holder.w + v.health_holder.h) * 0.09;

    SYS_UI.create([{
        type:"p",
        id:`battle_userinfo_name`, 
        attach:div_holder,
        text:`UNIT NAME`,
        style:{
            margin:"2%",
            fontWeight:"bold",
            fontSize:v.name.toString() + "px",
            color:"black"}  
    },{
        type:"div", 
        id:`battle_userinfo_health_holder`, 
        attach:div_holder,
        style:{
            width: v.health_holder.w.toString() + "px",
            height: v.health_holder.h.toString() + "px",
            marginBottom:"3%",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    }]);

    SYS_UI.progressBar({
        id:`battle_userinfo_health`,
        show_text:true,
        attach:`battle_userinfo_health_holder`, 
        width:v.health_holder.w.toString() + "px",
        height:v.health_holder.h.toString() + "px",
        bgcolor:"black",
        color:"rgb(0, 70, 15)",
        text_color:"white",
        font_size:v.health_text,
        current:1000,
        max:1000
    });
};

f.createUserInfo_Right = function(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.tag_holder = {w:v.holder_w * 0.95, h:v.holder_h * 0.35};
    v.main = {w:v.holder_w * 0.95, h:v.holder_h * 0.50};
    v.tag_text = (v.tag_holder.w + v.tag_holder.h) * 0.10;
    v.main_text = (v.main.w + v.main.h) * 0.18;

    SYS_UI.create([{
        type:"div", 
        id:`battle_userinfo_score_tag`, 
        attach:div_holder,
        style:{
            width: v.tag_holder.w.toString() + "px",
            height: v.tag_holder.h.toString() + "px",
            backgroundColor:"rgb(130, 10, 130)",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:`battle_userinfo_score_holder`, 
        attach:div_holder,
        style:{
            width: v.main.w.toString() + "px",
            height: v.main.h.toString() + "px",
            backgroundColor:"rgb(130, 10, 130)",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"p",
        id:`battle_userinfo_score_tag_text`,
        attach:`battle_userinfo_score_tag`,
        text:"SCORE",
        style:{
            margin:"0%",
            padding:"0%",
            color:"rgb(255,255,255)",
            fontWeight:"bold",
            fontSize:v.tag_text.toString() + "px"}
    },{
        type:"p",
        id:`battle_userinfo_score`,
        attach:`battle_userinfo_score_holder`,
        text:"000000",
        style:{
            margin:"0%",
            padding:"0%",
            color:"rgb(255,255,255)",
            fontWeight:"bold",
            fontSize:v.main_text.toString() + "px"}
    }]);
};

return f;}());var SI_INITIALIZER = (function(){var f ={};

f.initialize = function(){
    SYS_UI.clear({id:SYS_UI.body});
    createLayout(SYS_UI.body);
};

f.createPreload = function(length,name,div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.image = {w:v.holder_w / 10, h:v.holder_h / (length / 10)};

    SYS_UI.create([{
        type:"img", 
        id:`image_preloader_${SYS_Utils.idGenerator(10)}`, 
        attach:div_holder,
        style:{
            width: v.image.w.toString() + "px",
            height:v.image.h.toString() + "px"},
        attrib:{
            src:SYS_DTL.getImage(name),
            loading:"lazy",
            onload:"SC_INITIALIZER.imageDonePreloading()"
        }
    }]);
};

f.createSplash = function(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.logo = { w:v.holder_w * 0.75, h:(v.holder_w * 0.75) / 4 };

    SYS_UI.create([{
        type:"div", 
        id:`initializer_splashscreen`, 
        attach:div_holder,
        style:{
            width: v.logo.w.toString() + "px",
            height:v.logo.h.toString() + "px",
            background:`url( ${ SYS_DTL.getImage("game_developer") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}
    }]);
};

f.createWait = function(div_holder){
    SYS_UI.clear({id:div_holder});
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.txt_holder = {w:v.holder_w, h:v.holder_h * 0.05};
    v.bar_holder = {w:v.holder_w * 0.80, h:(v.holder_w * 0.80) / 10};
    v.txt = {m:(v.holder_w - v.bar_holder.w) / 2 , font:v.holder_w * 0.06};

    SYS_UI.create([{
        type:"div", 
        id:"initializer_waitscreen_txt_holder", 
        attach:div_holder,
        style:{
            width: v.txt_holder.w.toString() + "px",
            height: v.txt_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"flex-end",
            alignItems:"flex-start"}
    },{
        type:"p",
        id:`initializer_waitscreen`,
        attach:"initializer_waitscreen_txt_holder",
        text:"Loading Resources....",
        style:{
            marginLeft:v.txt.m.toString() + "px",
            fontWeight:"bold",
            fontSize:v.txt.font.toString() + "px",
            color:"white"}
     },{
        type:"div", 
        id:`initializer_wait_bar_holder`, 
        attach:div_holder,
        style:{
            width: v.bar_holder.w.toString() + "px",
            height: v.bar_holder.h.toString() + "px",
            margin:"2%",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    }]);

    SYS_UI.progressBar({
        id:`initializer_wait_bar`,
        show_text:false,
        attach:`initializer_wait_bar_holder`, 
        width:v.bar_holder.w.toString() + "px",
        height:v.bar_holder.h.toString() + "px",
        bgcolor:"gray",
        color:"white",
        current:0,
        max:1000
    });

};

function createLayout(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    
    SYS_UI.create([{
        type:"div", 
        id:"initializer_main_div", 
        attach:div_holder,
        style:{
            width: v.holder_w.toString() + "px",
            height: v.holder_h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"flex-start",
            flexWrap:"wrap",
            overflowY:"auto"}
    },{
        type:"div", 
        id:"initializer_screen_main", 
        attach:div_holder,
        style:{
            width: v.holder_w.toString() + "px",
            height: v.holder_h.toString() + "px",
            position:"absolute",
            background:`url( ${ SYS_DTL.getImage(`background_body`) })`,
            backgroundSize: "cover",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center",
            zIndex:2}
    },{
        type:"div", 
        id:"initializer_screen_holder", 
        attach:"initializer_screen_main",
        style:{
            width: v.holder_w.toString() + "px",
            height: v.holder_h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    }]);
};

return f;}());var SI_MENU = (function(){var f ={};

f.initialize = function(){
    SYS_UI.clear({id:SYS_UI.body});
    createLayout(SYS_UI.body);
    createBody("menu_body_div");
    createFooter("menu_footer_div");
};

function createLayout(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
   
    v.main = {w:v.holder_w, h:v.holder_h};
    if(v.main.h > v.main.w * 1.777 ){ v.main.h = v.main.w * 1.777; }
    if(v.main.w > v.main.h * 0.5625 ){ v.main.w = v.main.h * 0.5625; };

    v.body = { w:v.main.w, h:v.main.h * 0.90 };
    v.footer = { w:v.holder_w, h:v.main.h * 0.10, top:v.holder_h - v.main.h * 0.10};
       
    SYS_UI.create([{
        type:"div", 
        id:"menu_main_div", 
        attach:div_holder,
        style:{
            width: v.main.w.toString() + "px",
            height: v.main.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"menu_body_div", 
        attach:"menu_main_div",
        style:{
            width: v.body.w.toString() + "px",
            height: v.body.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"menu_footer_div", 
        attach:div_holder,
        style:{
            width: v.footer.w.toString() + "px",
            height: v.footer.h.toString() + "px",
            position:"absolute",
            zIndex:2,
            top:v.footer.top.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"end",
            alignItems:"end"}
    }]);

};

function createBody(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.game_title = { w:v.holder_w * 0.75, h:(v.holder_w * 0.80) / 2.5 };
    v.button = { w:v.holder_w * 0.55 , h:v.holder_w * 0.55 * 0.30, m:v.holder_h * 0.015};        
    
    SYS_UI.create([{
        type:"div", 
        id:"menu_gametitle", 
        attach:div_holder,
        style:{
            width: v.game_title.w.toString() + "px",
            height: v.game_title.h.toString() + "px",
            marginBottom:"10%",
            background:`url( ${ SYS_DTL.getImage("game_title") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}
    },{
        type:"div", 
        id:"menu_button_play", 
        attach:div_holder,
        style:{
            width: v.button.w.toString() + "px",
            height: v.button.h.toString() + "px",
            margin:"5%",
            background:`url( ${ SYS_DTL.getImage("button_play") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"},
        attrib:{
            onclick:"SC_MENU.play()"}
    }]);
};

function createFooter(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.font_size = v.holder_h * 0.30;

    SYS_UI.create([{
        type:"p",
        id:"menu_version_txt",
        attach:div_holder,
        text:SYS_Data.game.version,
        style:{
            fontWeight:"bold",
            fontSize:v.font_size.toString() + "px",
            color:"white",
            margin:"2%"}
    }]);
};

return f;}());var SI_PREPARATION = (function(){var f ={};

f.initialize = function(){
    SYS_UI.clear({id:SYS_UI.body});
    createLayout(SYS_UI.body);
    createProfile("preparation_profile_holder_div");
    createLoadout("preparation_opponent_holder_div","opponent");
    createLoadout("preparation_user_holder_div","user");
};

function createLayout(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.main = {w:v.holder_w, h:v.holder_h};
    if(v.main.h > v.main.w * 1.777 ){ v.main.h = v.main.w * 1.777; }
    if(v.main.w > v.main.h * 0.5625 ){ v.main.w = v.main.h * 0.5625; };
  
    v.profile = { w:v.main.w * 0.90, h:v.main.h * 0.15 };
    v.opponent = { w:v.main.w * 0.90, h:v.main.h * 0.40 };
    v.user = { w:v.main.w * 0.90, h:v.main.h * 0.30 };
    v.controller = { w:v.main.w * 0.90, h:v.main.h * 0.10};
    v.button = { w:v.controller.w * 0.45, h:(v.controller.w * 0.45) / 2.5 };

    SYS_UI.create([{
        type:"div", 
        id:"preparation_main_div", 
        attach:div_holder,
        style:{
            width: v.main.w.toString() + "px",
            height: v.main.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
        },{
        type:"div", 
        id:"preparation_profile_holder_div", 
        attach:"preparation_main_div",
        style:{
            width: v.profile.w.toString() + "px",
            height: v.profile.h.toString() + "px",
            marginTop:"3%",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center",
            background:`url( ${ SYS_DTL.getImage("background_white_type1") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}
        },{
        type:"div", 
        id:"preparation_opponent_holder_div", 
        attach:"preparation_main_div",
        style:{
            width: v.opponent.w.toString() + "px",
            height: v.opponent.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center",
            background:`url( ${ SYS_DTL.getImage("background_white_type6") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}
        },{
        type:"div", 
        id:"preparation_user_holder_div", 
        attach:"preparation_main_div",
        style:{
            width: v.user.w.toString() + "px",
            height: v.user.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center",
            background:`url( ${ SYS_DTL.getImage("background_white_type6") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}
        },{
        type:"div",
        id:"preparation_controller_div", 
        attach:"preparation_main_div",
        style:{
            width: v.controller.w.toString() + "px",
            height: v.controller.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center"}
        },{
        type:"div", 
        id:"preparation_main_start_button", 
        attach:"preparation_controller_div",
        style:{
            width: v.button.w.toString() + "px",
            height: v.button.h.toString() + "px",
            margin:"5%",
            background:`url( ${SYS_DTL.getImage("button_start") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"},
        attrib:{
            onclick:"SC_PREPARATION.start();"}
        },{
        type:"div", 
        id:"preparation_main_back_button", 
        attach:"preparation_controller_div",
        style:{
            width: v.button.w.toString() + "px",
            height: v.button.h.toString() + "px",
            margin:"5%",
            background:`url( ${SYS_DTL.getImage("button_back") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"},
        attrib:{
            onclick:"SC_MENU.initialize();"}
    }]);
};

function createProfile(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.margins = Math.floor(v.holder_h * 0.10);
    v.name_holder = { w:v.holder_w * 0.90, h:v.holder_h * 0.32 };
    v.name_txt = (v.name_holder.w + v.name_holder.h) * 0.05;
    v.name_input = {w:v.name_holder.w * 0.50, h:v.name_holder.h * 0.75 };
    v.commander_holder = { w:v.holder_w * 0.90, h:v.holder_h * 0.58 };
    v.commander_button = { w:v.commander_holder.h * 2, h:v.commander_holder.h * 0.70};

    SYS_UI.create([{
        type:"div", 
        id:"preparation_profile_name_holder_div", 
        attach:div_holder,
        style:{
            width: v.name_holder.w.toString() + "px",
            height: v.name_holder.h.toString() + "px",
            marginTop: v.margins.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"preparation_profile_commander_holder_div", 
        attach:div_holder,
        style:{
            width: v.commander_holder.w.toString() + "px",
            height: v.commander_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"flex-start"}
    },{ 
        type:"p",
        id:`preparation_profile_name_txt`,
        attach:"preparation_profile_name_holder_div",
        text:"Name:",
        style:{
            margin:"1%",
            fontWeight:"bold",
            fontSize:v.name_txt.toString() + "px",
            color:"black"}
    },{
        type:"input",
        id:`preparation_profile_name_input`,
        attach:"preparation_profile_name_holder_div",
        style:{
            width: v.name_input.w.toString() + "px",
            height: v.name_input.h.toString() + "px",
            padding:"1%",
            fontWeight:"bold",
            fontSize:v.name_txt.toString() + "px"},
        attrib:{ 
            placeholder:"Enter Name",
            onchange:`SC_PREPARATION.setName()`}
    }]);

    for(var i = 0; i <= 3; i++){
        SYS_UI.create([{
            type:"div", 
            id:`preparation_profile_commander_button_${i}`, 
            attach:"preparation_profile_commander_holder_div", 
            style:{
                width: v.commander_button.w.toString() + "px",
                height:v.commander_button.h.toString() + "px",
                marginTop:"0.5%",
                display:"flex",
                flexDirection:"row",
                justifyContent:"center",
                alignItems:"center",
                background:`url( ${ SYS_DTL.getImage(`commander_${i}`) })`,
                backgroundSize: "90% 90%",
                backgroundRepeat:"no-repeat",
                backgroundPosition:"center"},
            attrib:{
                   onclick:`SC_PREPARATION.setCommander(${i});`},
        }]);
    };

};

function createLoadout(div_holder,tag){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.division = tag === "opponent" ? 0.14 : 0.20;
    v.title_content = tag === "opponent" ? "ENEMY'S LOADOUT" : "YOUR LOADOUT";
    v.button_count = tag === "opponent" ? 12 : 8;

    v.top_holder = { w:v.holder_w * 0.90, h:v.holder_h * v.division };
    v.title_holder = { w:v.top_holder.w * 0.60, h:v.top_holder.h };
    v.controls_holder = { w:v.top_holder.w * 0.40, h:v.top_holder.h };
    v.units_holder = { w:v.holder_w * 0.90, h:(v.holder_h - v.top_holder.h) * 0.80};

    v.title_text = (v.title_holder.w + v.title_holder.h) * 0.08;
    v.control_button = { w:v.controls_holder.h * 0.90 , h:v.controls_holder.h * 0.90 };

    SYS_UI.create([{
        type:"div", 
        id:`preparation_loadout_${tag}_top_holder`, 
        attach:div_holder,
        style:{
            width: v.top_holder.w.toString() + "px",
            height: v.top_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:`preparation_loadout_${tag}_units_holder`, 
        attach:div_holder,
        style:{
            width: v.units_holder.w.toString() + "px",
            height: v.units_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"space-around",
            alignItems:"center",
            flexWrap:"wrap"}
    },{
        type:"div", 
        id:`preparation_loadout_${tag}_title_holder`, 
        attach:`preparation_loadout_${tag}_top_holder`, 
        style:{
            width: v.title_holder.w.toString() + "px",
            height: v.title_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"flex-start",
            alignItems:"center"}
    },{
        type:"div", 
        id:`preparation_loadout_${tag}_controls_holder`, 
        attach:`preparation_loadout_${tag}_top_holder`, 
        style:{
            width: v.controls_holder.w.toString() + "px",
            height: v.controls_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"flex-end",
            alignItems:"center"}
    },{ 
        type:"p",
        id:`preparation_loadout_${tag}_title_text`, 
        attach:`preparation_loadout_${tag}_title_holder`, 
        text:v.title_content,
        style:{
            margin:"1%",
            fontWeight:"bold",
            fontSize:v.title_text.toString() + "px",
            color:"black"}
    },{
        type:"div", 
        id:`preparation_loadout_${tag}_controls_randomize_button`, 
        attach:`preparation_loadout_${tag}_controls_holder`, 
        style:{
            width: v.control_button.w.toString() + "px",
            height: v.control_button.h.toString() + "px",
            margin:"5%",
            background:`url( ${SYS_DTL.getImage("button_randomize") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"},
        attrib:{
            onclick:`SC_PREPARATION.randomize("${tag}")`}
    }]);

    createUnits(`preparation_loadout_${tag}_units_holder`,tag,v.button_count);
};

function createUnits(div_holder,tag,button_count){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.button = (v.holder_w / 4) * 0.75;
    v.icon = v.button * 0.80;

    for(var index = 0; index <= button_count - 1; index ++){

        SYS_UI.create([{
            type:"div", 
            id:`preparation_loadout_${tag}_unit_button_${index}`, 
            attach:div_holder,
            style:{
                width: v.button.toString() + "px",
                height:v.button.toString() + "px",
                marginLeft:"2%",
                marginRight:"2%",
                display:"flex",
                flexDirection:"row",
                justifyContent:"center",
                alignItems:"center",
                background:`url( ${ SYS_DTL.getImage("background_white_type3") })`,
                backgroundSize: "100% 100%",
                backgroundRepeat:"no-repeat",
                backgroundPosition:"center"},
            attrib:{
                onclick:`SC_PREPARATION.activateEditor("${tag}",${index});`},
        },{
            type:"div", 
            id:`preparation_loadout_${tag}_unit_icon_${index}`, 
            attach:`preparation_loadout_${tag}_unit_button_${index}`, 
            style:{
                width: v.icon.toString() + "px",
                height:v.icon.toString() + "px",
                background:`url( ${ SYS_DTL.getImage("default") })`,
                backgroundSize: "100% 100%",
                backgroundRepeat:"no-repeat",
                backgroundPosition:"center"}, 
        }]);
    };

};
return f;}());var SI_PREPARATION_Editor = (function(){var f ={};


f.initialize = function(){
    createLayout(SYS_UI.body);
    createTop("preparation_editor_top_holder");
    createInfo("preparation_editor_info_holder");
    createSelection("preparation_editor_selection_holder");
    createControl("preparation_editor_control_holder");
};

function createLayout(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    
    v.main = {w:v.holder_w, h:v.holder_h};
    if(v.main.h > v.main.w * 1.777 ){ v.main.h = v.main.w * 1.777; }
    if(v.main.w > v.main.h * 0.5625 ){ v.main.w = v.main.h * 0.5625; };
    v.main_pos = {top:(v.holder_h - v.main.h) / 2, left:(v.holder_w - v.main.w) / 2}

    v.top_holder = {w:v.main.w * 0.80, h:v.main.h * 0.07};
    v.info_holder = {w:v.main.w * 0.80, h:v.main.h * 0.40};
    v.selection_holder = {w:v.main.w * 0.80, h:v.main.h * 0.35};
    v.control_holder = {w:v.main.w * 0.80, h:v.main.h * 0.08};
    
    SYS_UI.create([{
        type:"div", 
        id:"preparation_editor_main_holder", 
        attach:div_holder,
        style:{
            width: v.holder_w.toString() + "px",
            height: v.holder_h.toString() + "px",
            position:"absolute",
            backgroundColor:"rgba(50,50,50,0.5)",
            zIndex:9999} //zIndex 1 is for player health bar text so we set it to 2
    },{
        type:"div", 
        id:"preparation_editor_main", 
        attach:"preparation_editor_main_holder",
        style:{
            width: v.main.w.toString() + "px",
            height: v.main.h.toString() + "px",
            marginTop:v.main_pos.top.toString() + "px",
            marginLeft:v.main_pos.left.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center",
            background:`url( ${ SYS_DTL.getImage("background_white_type4") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat"}
    },{
        type:"div", 
        id:"preparation_editor_top_holder", 
        attach:"preparation_editor_main", 
        style:{
            width: v.top_holder.w.toString() + "px",
            height: v.top_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
     },{
        type:"div", 
        id:"preparation_editor_info_holder", 
        attach:"preparation_editor_main", 
        style:{
            width: v.info_holder.w.toString() + "px",
            height: v.info_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"} 
    },{
        type:"div", 
        id:"preparation_editor_selection_holder", 
        attach:"preparation_editor_main", 
        style:{
            width: v.selection_holder.w.toString() + "px",
            height: v.selection_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"preparation_editor_control_holder", 
        attach:"preparation_editor_main", 
        style:{
            width: v.control_holder.w.toString() + "px",
            height: v.control_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    }]);
};

function createTop(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.text = (v.holder_w + v.holder_h) * 0.07;

    SYS_UI.create([{
        type:"p",
        id:`preparation_editor_top_text`, 
        attach:div_holder, 
        text:"SAMPLE LOADOUT",
        style:{
            margin:"1%",
            fontWeight:"bold",
            fontSize:v.text.toString() + "px",
            color:"black"}
    }]);
};

function createInfo(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.pic_holder = {w:v.holder_w * 0.95, h:v.holder_h * 0.30 };
    v.description_holder = {w:v.holder_w * 0.95, h:v.holder_h * 0.68 };
    v.icon = v.pic_holder.h * 0.95;
    v.ability = {w:(v.description_holder.w * 0.55) * 0.90, h:v.description_holder.h * 0.90 };
    v.ability_font = (v.ability.w + v.ability.h) * 0.05;

    SYS_UI.create([{
        type:"div", 
        id:"preparation_editor_info_pic_holder", 
        attach:div_holder,
        style:{
            width: v.pic_holder.w.toString() + "px",
            height: v.pic_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"preparation_editor_info_description_holder", 
        attach:div_holder,
        style:{
            width: v.description_holder.w.toString() + "px",
            height: v.description_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"preparation_editor_info_descleft_holder", 
        attach:"preparation_editor_info_description_holder", 
        style:{
            width: (v.description_holder.w * 0.45).toString() + "px",
            height: v.description_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"preparation_editor_info_descright_holder", 
        attach:"preparation_editor_info_description_holder", 
        style:{
            width: (v.description_holder.w * 0.55).toString() + "px",
            height: v.description_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"} 
    },{
        type:"div", 
        id:"preparation_editor_info_pic_symbol", 
        attach:"preparation_editor_info_pic_holder", 
        style:{
            width: v.icon.toString() + "px",
            height:v.icon.toString() + "px",
            marginLeft:"2%",
            marginRight:"2%",
            background:`url( ${ SYS_DTL.getImage("default") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}, 
    },{
        type:"div", 
        id:"preparation_editor_info_pic_skin", 
        attach:"preparation_editor_info_pic_holder", 
        style:{
            width: v.icon.toString() + "px",
            height:v.icon.toString() + "px",
            marginLeft:"2%",
            marginRight:"2%",
            background:`url( ${ SYS_DTL.getImage("default") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}, 
    },{
        type:"div", 
        id:"preparation_editor_info_descright_ability", 
        attach:"preparation_editor_info_descright_holder", 
        style:{
            width: v.ability.w.toString() + "px",
            height: v.ability.h.toString() + "px",
            padding:"3%",
            fontSize: v.ability_font.toString() + "px",
            overflowY:"scroll",
            color:"rgb(255,255,255)",
            backgroundColor:"rgb(0, 0, 0)"}
    }]);

    document.getElementById("preparation_editor_info_descright_ability").innerHTML = "There are many variations of passages of Lorem Ipsum available, but the majority have suffered alteration in some form, by injected humour, or randomised words which don't look even slightly believable. If you are going to use a passage of Lorem Ipsum, you need to be sure there isn't anything embarrassing hidden in the middle of text. All the Lorem Ipsum generators on the Internet tend to repeat predefined chunks as necessary, making this the first true generator on the Internet. It uses a dictionary of over 200 Latin words, combined with a handful of model sentence structures, to generate Lorem Ipsum which looks reasonable. The generated Lorem Ipsum is therefore always free from repetition, injected humour, or non-characteristic words etc.";
    createInfoDescLeft("preparation_editor_info_descleft_holder");
};

function createInfoDescLeft(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.name = (v.holder_w + v.holder_h) * 0.045;
    v.stats_holder = {w:v.holder_w, h:v.holder_h * 0.75 };
    v.stat_text = (v.stats_holder.w + v.stats_holder.h) * 0.05;

    v.stat_list = ["health","power","vigor","agility","attack_range"];

    SYS_UI.create([{
        type:"p",
        id:`preparation_editor_descleft_name`, 
        attach:div_holder, 
        text:"GATLING GUN",
        style:{
            marginTop:"3%",
            marginBottom:"3%",
            fontWeight:"bold",
            fontSize:v.name.toString() + "px",
            color:"black"}
    },{
        type:"div", 
        id:`preparation_editor_descleft_stats_holder`, 
        attach:div_holder, 
        style:{
            width: v.stats_holder.w.toString() + "px",
            height: v.stats_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"flex-start",
            alignItems:"flex-start"}
    }]);


    v.stat_list.forEach(st => {
        SYS_UI.create([{
            type:"p",
            id:`preparation_editor_descleft_${st}`, 
            attach:`preparation_editor_descleft_stats_holder`,
            text:"Health: 0",
            style:{
                margin:"3%",
                fontWeight:"bold",
                fontSize:v.stat_text.toString() + "px",
                color:"black"}
        }]);
    })

    SYS_UI.create([{
        type:"p",
        id:`preparation_editor_descleft_attack_type`, 
        attach:`preparation_editor_descleft_stats_holder`,
        text:"ATK Type: Normal",
        style:{
            margin:"3%",
            fontWeight:"bold",
            fontSize:(v.stat_text * 0.95).toString() + "px",
            color:"black"}
    }]);

};

function createSelection(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.list_div = { w:v.holder_w * 0.95, h:v.holder_h * 0.70 };
    v.list_holder = { w:v.list_div.w * 0.95, h:v.list_div.h * 0.95 };
    v.controls_holder = { w:v.holder_w * 0.95, h:v.holder_h * 0.25 };
    v.button = (v.list_holder.w / 3) * 0.70;
    v.icon = v.button * 0.70;
    v.controls_button =  {w:v.controls_holder.w * 0.30, h:v.controls_holder.h * 0.60 };
    v.controls_text = ( v.controls_holder.w + v.controls_holder.h ) * 0.08;

    SYS_UI.create([{
        type:"div", 
        id:"preparation_editor_selection_list_div", 
        attach:div_holder,
        style:{
            width: v.list_div.w.toString() + "px",
            height: v.list_div.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"preparation_editor_selection_list_holder", 
        attach:"preparation_editor_selection_list_div",
        style:{
            width: v.list_holder.w.toString() + "px",
            height: v.list_holder.h.toString() + "px",
            padding:"5%",
            display:"flex",
            flexDirection:"row",
            justifyContent:"space-around",
            alignItems:"center",
            flexWrap:"wrap",
            background:`url( ${ SYS_DTL.getImage("background_white_type7") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat"}
    },{
        type:"div", 
        id:"preparation_editor_selection_controls_holder", 
        attach:div_holder,
        style:{
            width: v.controls_holder.w.toString() + "px",
            height: v.controls_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"preparation_editor_selection_controls_prev_button", 
        attach:"preparation_editor_selection_controls_holder",
        style:{
            width: v.controls_button.w.toString() + "px",
            height: v.controls_button.h.toString() + "px",
            background:`url( ${SYS_DTL.getImage("button_prev") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"},
        attrib:{
            onclick:`SC_PREPARATION_Editor.selectionControl("prev")`}
    },{
        type:"p",
        id:`preparation_editor_selection_controls_text`, 
        attach:"preparation_editor_selection_controls_holder",
        text:"0/0",
        style:{
            marginLeft:"3%",
            marginRight:"3%",
            fontWeight:"bold",
            fontSize:v.controls_text.toString() + "px",
            color:"black"}
    },{
        type:"div", 
        id:"preparation_editor_selection_controls_next_button", 
        attach:"preparation_editor_selection_controls_holder",
        style:{
            width: v.controls_button.w.toString() + "px",
            height: v.controls_button.h.toString() + "px",
            background:`url( ${SYS_DTL.getImage("button_next") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"},
        attrib:{
            onclick:`SC_PREPARATION_Editor.selectionControl("next")`}
    }]);

    for(var index = 0; index <= 5; index ++){

        SYS_UI.create([{
            type:"div", 
            id:`preparation_editor_selection_list_button_${index}`, 
            attach:"preparation_editor_selection_list_holder",
            style:{
                width: v.button.toString() + "px",
                height:v.button.toString() + "px",
                marginLeft:"2%",
                marginRight:"2%",
                display:"flex",
                flexDirection:"row",
                justifyContent:"center",
                alignItems:"center",
                background:`url( ${ SYS_DTL.getImage("background_selection_type3") })`,
                backgroundSize: "100% 100%",
                backgroundRepeat:"no-repeat",
                backgroundPosition:"center"},
            attrib:{
                onclick:`SC_PREPARATION_Editor.select(${index})`},
        },{
            type:"div", 
            id:`preparation_editor_selection_list_icon_${index}`, 
            attach:`preparation_editor_selection_list_button_${index}`, 
            style:{
                width: v.icon.toString() + "px",
                height:v.icon.toString() + "px",
                background:`url( ${ SYS_DTL.getImage("default") })`,
                backgroundSize: "100% 100%",
                backgroundRepeat:"no-repeat",
                backgroundPosition:"center"}, 
        }]);
    };

};

function createControl(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.control_button = { w:v.holder_w * 0.45 , h:(v.holder_w  * 0.45) / 3 };

    SYS_UI.create([{
        type:"div", 
        id:`preparation_editor_control_close_button`, 
        attach:div_holder, 
        style:{
            width: v.control_button.w.toString() + "px",
            height: v.control_button.h.toString() + "px",
            background:`url( ${SYS_DTL.getImage("button_close") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"},
        attrib:{
            onclick:`SC_PREPARATION_Editor.close()`}
    }]);
};


return f;}());var SI_RESULT = (function(){var f ={};

f.initialize = function(bd,score){
    SYS_UI.clear({id:SYS_UI.body});
    createLayout(SYS_UI.body);
    createHead("result_head_div",bd);
    createProfile("result_profile_div",bd);
    createLoadout("result_loadout_div",bd);
    createBody("result_body_div",score);
    createFooter("result_footer_div");
};

function createLayout(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.main = {w:v.holder_w, h:v.holder_h};
    if(v.main.h > v.main.w * 1.777 ){ v.main.h = v.main.w * 1.777; }
    if(v.main.w > v.main.h * 0.5625 ){ v.main.w = v.main.h * 0.5625; };

    v.head = { w:v.main.w, h:v.main.h * 0.15 };
    v.profile = { w:v.main.w, h:v.main.h * 0.15 };
    v.loadout = { w:v.main.w, h:v.main.h * 0.25 };
    v.body = { w:v.main.w, h:v.main.h * 0.30 };
    v.footer = { w:v.main.w, h:v.main.h * 0.15 };

    SYS_UI.create([{
        type:"div", 
        id:"result_main", 
        attach:div_holder,
        style:{
            width: v.main.w.toString() + "px",
            height: v.main.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"result_head_div", 
        attach:"result_main",
        style:{
            width: v.head.w.toString() + "px",
            height: v.head.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center" }
    },{
        type:"div", 
        id:"result_profile_div", 
        attach:"result_main",
        style:{
            width: v.profile.w.toString() + "px",
            height: v.profile.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center" }
    },{
        type:"div", 
        id:"result_loadout_div", 
        attach:"result_main",
        style:{
            width: v.loadout.w.toString() + "px",
            height: v.loadout.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"result_body_div", 
        attach:"result_main",
        style:{
            width: v.body.w.toString() + "px",
            height: v.body.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"result_footer_div", 
        attach:"result_main",
        style:{
            width: v.footer.w.toString() + "px",
            height: v.footer.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    }]);
};

function createHead(div_holder,bd){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.result_image = { w:v.holder_w * 0.80, h:(v.holder_w * 0.80) * 0.35 };
    v.txt1 = (v.holder_w + v.holder_h) * 0.05; 

    SYS_UI.create([{
        type:"div", 
        id:"result_image", 
        attach:div_holder,
        style:{
            width: v.result_image.w.toString() + "px",
            height: v.result_image.h.toString() + "px",
            background:`url( ${ SYS_DTL.getImage(`text_gameover`) })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}
    }]);
};

function createProfile(div_holder,bd){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.profile_holder = {w: v.holder_w * 0.85, h:v.holder_h * 0.85};
    v.left = {w:v.profile_holder.w * 0.30, h:v.profile_holder.h * 0.60};
    v.right = {w:v.profile_holder.w * 0.55, h:v.profile_holder.h * 0.80};
    v.name = (v.right.w + v.right.h) * 0.08;

    SYS_UI.create([{
        type:"div", 
        id:"result_profile_holder", 
        attach:div_holder,
        style:{
            width: v.profile_holder.w.toString() + "px",
            height: v.profile_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center",
            flexWrap:"wrap",
            background:`url( ${ SYS_DTL.getImage("background_white_type1") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}
    },{
        type:"div", 
        id:`result_profile_left_div`, 
        attach:"result_profile_holder", 
        style:{
            width: v.left.w.toString() + "px",
            height: v.left.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center",
            background:`url( ${ SYS_DTL.getImage(`commander_${bd.user.commander}`) })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}
    },{
        type:"div", 
        id:`result_profile_right_div`, 
        attach:"result_profile_holder", 
        style:{
             width: v.right.w.toString() + "px",
             height: v.right.h.toString() + "px",
             display:"flex",
             flexDirection:"column",
             justifyContent:"center",
             alignItems:"center"}
    },{
        type:"p",
        id:`result_profile_name`, 
        attach:`result_profile_right_div`,
        text:bd.user.name,
        style:{
            margin:"2%",
            fontWeight:"bold",
            fontSize:v.name.toString() + "px",
            color:"black"}  
    },{
        type:"p",
        id:`result_profile_id`, 
        attach:`result_profile_right_div`,
        text:`ID: ${SYS_Utils.idGenerator(12).toString().toUpperCase()}`,
        style:{
            fontStyle:"italic",
            fontSize:(v.name * 0.80).toString() + "px",
            color:"black"}  
    }]);
};

function createLoadout(div_holder,bd){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.loadout_holder = {w: v.holder_w * 0.85, h:v.holder_h * 0.95};
    v.icon = (v.loadout_holder.h / 2) * 0.65;

    SYS_UI.create([{
        type:"div", 
        id:`result_loadout_holder`, 
        attach:div_holder,
        style:{
            width: v.loadout_holder.w.toString() + "px",
            height: v.loadout_holder.h.toString() + "px",
            paddingTop:"2%",
            paddingBottom:"4%",
            paddingLeft:"3%",
            paddingRight:"3%",
            display:"flex",
            flexDirection:"row",
            justifyContent:"space-around",
            alignItems:"center",
            flexWrap:"wrap",
            background:`url( ${ SYS_DTL.getImage("background_white_type1") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}
    }]);

    for(var index = 0; index <= bd.user.units.loadout.length - 1; index ++){

        v.skin = SYS_DTL.getData("units",{idname:bd.user.units.loadout[index].idname},"skin");

        SYS_UI.create([{
            type:"div", 
            id:`result_loadout_icon_${index}`, 
            attach:`result_loadout_holder`,
            style:{
                width: v.icon.toString() + "px",
                height:v.icon.toString() + "px",
                margin:"1.5%",
                //background:`url( ${ SYS_DTL.getImage(`symbol_${bd.user.units.loadout[index].idname}`) })`,
                background:`url( ${ SYS_DTL.getImage(v.skin) })`,
                backgroundSize: "100% 100%",
                backgroundRepeat:"no-repeat",
                backgroundPosition:"center"}, 
        }]);
    };

};

function createBody(div_holder,score){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.ratio = v.holder_w / v.holder_h;
    v.score = {w:v.holder_w * 0.60, h:v.holder_h, r:0, dv:0}
    //=========================================================
    if (v.ratio >= 1.6) { v.score.r = 0.60; v.score.dv = 2;
    }else if(v.ratio >= 1 && v.ratio < 1.6 ) { v.score.r = 0.80; v.score.dv = 2;
    } else if (v.ratio < 1) { v.score.r = 0.90; v.score.dv = 0; };
    //=========================================================
    v.score.w = v.holder_w * v.score.r;
    v.divider = {w:v.score.w, h:v.score.h * 0.03};
    v.txt1 = (v.score.w + v.score.h) * 0.05; 
    v.txt2 = (v.score.w + v.score.h) * 0.07; 

    SYS_UI.create([{
        type:"div", 
        id:"result_score_div", 
        attach:div_holder,
        style:{
            width: v.score.w.toString() + "px",
            height: v.score.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"flex-start" }
    },{
        type:"p",
        id:"result_txt1", 
        attach:"result_score_div", 
        text:score.damage_dealt,
        style:{
            margin:"2%",
            fontSize:v.txt1.toString() + "px",
            color:"white"}
    },{       
        type:"p",
        id:"result_txt3", 
        attach:"result_score_div", 
        text:score.combat_score,
        style:{
            margin:"2%",
            fontSize:v.txt1.toString() + "px",
            color:"white"}
    },{       
        type:"p",
        id:"result_txt4", 
        attach:"result_score_div", 
        text:score.time,
        style:{
            margin:"2%",
            fontSize:v.txt1.toString() + "px",
            color:"white"}
    },{      
        type:"div", 
        id:"result_divider", 
        attach:"result_score_div", 
        style:{
            border:`${v.score.dv}px solid white`,
            width: v.divider.w.toString() + "px",
            height: v.divider.h.toString() + "px",
            backgroundColor:"white"}
    },{
        type:"p",
        id:"result_txt_total", 
        attach:"result_score_div", 
        text:score.total_points,
        style:{
            margin:"4%",
            fontWeight:"bold",
            fontSize:v.txt2.toString() + "px",
            color:"white"}
    }]);
};

function createFooter(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.continue = { w:v.holder_w * 0.65, h:v.holder_w * 0.65 * 0.25 };
    
    SYS_UI.create([{
        type:"div", 
        id:"result_continue_button", 
        attach:div_holder,
        style:{
            width: v.continue.w.toString() + "px",
            height: v.continue.h.toString() + "px",
            background:"transparent",
            background:`url( ${ SYS_DTL.getImage("button_continue") })`,
            backgroundSize: "100% 100%"},
        attrib:{
                onclick:"SC_RESULT.continue()"}
    }]);
};

return f;}());var SYS_Data = (function(){var f ={};
//================================================================//
//THIS DATA IS PRIVATE AND SHOULD NOT BE SAVED IN LOCAL STORAGE
f.game = {
     version:"v0.04 ALPHA",
     platform:"mobile",
     //This is used to detect screen changes
     window_width:0,
     window_height:0,
     //This is used in SC_BATTLE.js
     battle_canvas:"battle_canvas",
     battle_update_time:5
};
f.debugging = {
     //Please refer to SC_MENU createPlayerData
     user_loadout_debug:false,
     user_loadout_unit:10,

     //Please refer to ENGINE_Player.updateOpponent
     opponent_spawn_debug:false,
     opponent_spawn_unit:"teslacoil"
};
//================================================================//
f.battle = {
     config:{
          arena_size:{w:100,h:80}, //Used inside BATTLE_Render
          battle_time:0,
          battle_is_over:false,
          battle_was_paused:false
     },
     units:[],
     actions:[],
     sfx:[],
     status:[],
     opponent:{
          name:"Enemy",
          units:{ loadout:[], selection:[], reserved:[]},
          spawn_timer:{left:0,right:0, max:10}
     },
     user:{
          name:"",
          commander:0,
          surrendered:false,
          damage_dealt:0,
          combat_score:0,
          tile_selected:"left",
          effects_recieved:[], //if there is no unit then the user will recieve the effect
          stats:{  health_current:0, health_max:0 }, //initiated at ENGINE_Player.initializePlayers
          units:{ loadout:[], selection:[], reserved:[]},
     }
 };
//================================================================//
//We need to copy the original data at the init of the game so that
//we can reset it immediately after every battle. Used in SC_PREPARATION;
//This variable is initialized on window_onload.js
f.battle_original_copy = {};

return f;}());var SYS_DTL = (function(){var f ={};

var image_path = "././resources/images/";
var all_images = []; 
var all_units = [];
var all_status = [];

var the_list =  {   image:null,
                    units:null,
                    status:null,
                };


f.initialize = function(){
    combineData();
    //Then lets preload them
    all_images.forEach((img) => {
        var link = document.createElement('link');
        link.rel = 'preload';
        link.as = "image";
        document.head.appendChild(link);
        link.href = `${image_path}${img.link}`;
    });
};

f.getImage = function(name){   
    var lnk = "";
    all_images.forEach(img => {
        if(img.name === name){ lnk = img.link; };
    });
    return `${image_path}${lnk}`;
};

f.getData = function(type,params,targets){
    //! IF RETURN DATA LENGTH IS 1 then it will return DATA[0] instead of the whole DATA !!!!!
    //-If PARAMS is string then return an array of values of the key targeted(the string)
    //example: string = id so it will return with [id value,id value,id value]
    //-If params is an object then loop through the DTL if the object meets all the params
    // then return based on the targets required
    //If targets is array then return the keys that meets the target
    //example: targets = [id,name] so it will return with [[id value,name value],[id value,name value]]
     //If targets is array then return the keys that meets the target
    //example: targets = string then it will return with [id value,id value,id value]
    //If target is empty then it will return all the key and value pairs

    var check = [];
    var target_values = [];
    var data = [];
    the_list[type].forEach((l)=>{
        if(typeof(params) === "string"){
            data.push(l[params]);
        }else if(typeof(params) === "object" && params != null){
            //Reset the variables
            check = [];
            target_values = [];
            //Check if the object meet the value requirements
            for (const [key, value] of Object.entries(params)) {
                if(l[key] === params[key])
                { check.push(true); }else{ check.push(false)};
            };
            //If all the requirements are meet then send the array
            if(check.indexOf(false) === -1){ 
                if(typeof(targets) === "object" && targets.length >= 1){
                    targets.forEach((t)=>{
                        target_values.push(l[t]);
                    });
                    data.push(target_values); 
                }else if(typeof(targets) === "string"){
                    data.push(l[targets]); 
                }else{
                    data.push(l);   
                };
            };
        };    
    });

    if(typeof(params) === "undefined"){ data = SYS_Utils.copyObject(the_list[type]); };
    if(data.length === 1){ return data[0]; }else{ return data; };
};

function combineData(){
    //First lets combine all the images
   all_images = SYS_Utils.combineArray(DTL_IMAGE_Interface.list,all_images);
   all_images = SYS_Utils.combineArray(DTL_IMAGE_SFX.list,all_images);
   all_images = SYS_Utils.combineArray(DTL_IMAGE_Skins.list,all_images);
   all_images = SYS_Utils.combineArray(DTL_IMAGE_Symbols.list,all_images);
   all_images = SYS_Utils.combineArray(DTL_IMAGE_Status.list,all_images);
   all_images = SYS_Utils.combineArray(DTL_IMAGE_Commander.list,all_images);
    //Lets combine all the weapons
    all_units = SYS_Utils.combineArray(DTL_Units.list,all_units);
    //Lets combine all the units
    all_status = SYS_Utils.combineArray(DTL_Status.list,all_status);
    //Lets assign the image in the list for getData
    the_list.image = all_images;
    the_list.units = all_units;
    the_list.status = all_status;
};
return f;}());var SYS_Interface = (function(){var f ={};

f.initialize = function(){
    //Initialize SYS_UI main holder
    SYS_UI.body = "body";

    //Set up document CSS
    setupDocumentBody();

    //Detect interface changes
    //Only use 100 to prevent lag
    setInterval(updateChanges,100);
};

function setupDocumentBody(){
    //Save the current interface window sizes
    SYS_Data.game.window_width = window.innerWidth;
    SYS_Data.game.window_height = window.innerHeight;
    SYS_Data.game.window_scale = window.devicePixelRatio; 

    //Set app body
    if(SYS_Data.game.platform === "desktop"){
        //TO DO
    }else if(SYS_Data.game.platform === "mobile"){
        //Only allowed portrait size in mobiles
        if(window.innerWidth <= window.innerHeight){
            var w = window.innerWidth;
            var h = window.innerHeight;
            var ml = 0;
        }else if(window.innerWidth > window.innerHeight){
            var w = window.innerHeight / 2;
            var h = window.innerHeight;
            var ml = Math.floor((window.innerWidth - w) / 2);
        };
    };

    SYS_UI.style([{
        id:SYS_UI.body,
        width: w.toString() + "px",
        height: h.toString() + "px",
        marginLeft: ml.toString() + "px",
        overflow:"hidden",
        position:"absolute",
        display:"flex",
        flexDirection:"column",
        justifyContent:"center",
        alignItems:"center",
        background:`url( ${ SYS_DTL.getImage(`background_body`) })`,
        backgroundSize: "cover",
        backgroundRepeat:"no-repeat",
        backgroundPosition:"center"
    }]);
};

function updateChanges(){
    var reload_now = false;

    //Detect screen size change
    //Also it detects any orientation changes
    if(SYS_Data.game.window_width !== window.innerWidth || SYS_Data.game.window_height !== window.innerHeight){
        reload_now = true;
    };

    //In mobile devices especially android when we open the keyboard
    //the window.innerHeight changes so we reload unintentionally. But
    //in Android we don't allow orientation change so we don't need to
    //worry for change in window sizes and to allow keyboard for inputs
    //we dont reload if we are on mobile platform
    if(reload_now === true){
        if(SYS_Data.game.platform !== "mobile"){
            location.reload();
        };
    };

};

return f;}());var SYS_UI = (function(){var f = {};
/*
    .create([{type:"",attach:"",id:""}]);
    .create([{type:"",attach:"",id:"",class:"",text:"",attrib:{onclick:""}}]);

    .attrib([{id:"",onclick:"foo();"}]);
    .attrib([{id:"",onclick:"foo();",onmouseover:"bar();"}]);

    .style([{id:"",color:"red"}]);
    .style([{id:"",fontSize:"12px",backgroundColor:"red"}]);

    var mylist = ["q1","q2","q3"];
    .selection({id:"",attach:"",value:"content"/"index",list:mylist,function:"bar();"});

    .progressBar({id:"",attach:"",width:"300px",height:"100px",color:"green"});
    .progressBar({id:"",current:100,max:2000});

    id = the element id of the cooldown mask div
    .cooldown({id:"",current:3,max:10});

*/

f.body = "";

f.clear = function(params){
    /*This function deletes only child elements*/
    var a = document.getElementById(params.id); 
    if(a !== null){
        while (a.hasChildNodes()){
            a.removeChild(a.firstChild);
        };
    };
};

f.delete = function(params){
    /* This function deletes the parent element 
    including the child elements */
        
    var a = document.getElementById(params.id); 
    if(a !== null) {
        a.parentNode.removeChild(a);
    };
};

f.create = function(params){
    for(var i = 0; i <= params.length - 1; i++){
        var new_element = null;

        if(typeof(params[i].type) !== "undefined"){
            new_element = document.createElement(params[i].type);
    
            if(typeof(params[i].attach) !== "undefined" && new_element !== null){
                var attach_element = document.getElementById(params[i].attach);
                attach_element.appendChild(new_element);
            };
        };
    
        if(typeof(params[i].id) !== "undefined" && new_element !== null){
            new_element.setAttribute("id",params[i].id);
        };
    
        if(typeof(params[i].class) !== "undefined" && new_element !== null){
            new_element.setAttribute("class",params[i].class);
        };
    
        if(typeof(params[i].text) !== "undefined" && new_element !== null){
            var text_element = document.createTextNode(params[i].text);
            new_element.appendChild(text_element);
        };
            
        if(typeof(params[i].attrib) !== "undefined" && new_element !== null){
            params[i].attrib.id = params[i].id;
            f.attrib([params[i].attrib]);
        };
    
        if(typeof(params[i].style) !== "undefined" && new_element !== null){
            params[i].style.id = params[i].id;
            f.style([params[i].style]);
        };

    };

};

f.attrib = function(params){
    for(var i = 0; i <= params.length - 1; i++){
        var target_element = document.getElementById(params[i].id);
    
        for (var key of Object.keys(params[i])){
            if(key.toString() !== "id"){
                target_element.setAttribute(key.toString(),params[i][key]);
            }  
        };
    };

};

f.style = function(params){
    for(var i = 0; i <= params.length - 1; i++){
        var target_element = document.getElementById(params[i].id);

        for (var key in params[i]){
            if(key.toString() !== "id"){
                target_element.style[key] = params[i][key];
            };  
        };
    };
};

f.selection = function(params){
    if(typeof(params.id) !== "undefined"){
        if(typeof(params.attach) !== "undefined"){
            var selection_element = document.createElement("SELECT");
            selection_element.setAttribute("id",params.id);
            selection_element.style.fontSize = params.fontSize;
            var attach_element = document.getElementById(params.attach);
            attach_element.appendChild(selection_element);
        };

        if(typeof(params.function) !== "undefined"){
            selection_element.setAttribute("onchange",params.function);
        };

        if(typeof(params.list) !== "undefined"){
            for (var i = 0;i < params.list.length;i++){
                var option_element = document.createElement("OPTION");
                option_element.setAttribute("id",params.id+"_option"+i);
                option_element.setAttribute("class",params.id+"_class");

                var text_element = document.createElement("P"); 
                text_element.innerHTML = params.list[i];
                text_element.setAttribute("class",params.id+"_texts");
                option_element.appendChild(text_element);

                if(typeof(params.value) !== "undefined" && params.value === "content"){
                    option_element.setAttribute("value",params.list[i]);
                }else if(typeof(params.value) !== "undefined" && params.value === "index"){
                    option_element.setAttribute("value",i);
                };
                selection_element.appendChild(option_element);    
            }; 
        };
    };
};

f.progressBar = function(params)
{
    if(typeof(params.id) !== "undefined")
    {
        if(typeof(params.attach) !== "undefined")
        {
            var holder_element = document.createElement("DIV");
            holder_element.setAttribute("id",params.id+"_holder");
            holder_element.style.width = params.width; 
            holder_element.style.height = params.height;
            holder_element.style.backgroundColor = params.bgcolor;
            holder_element.style.position = "absolute";
            holder_element.style.display = "flex";
            holder_element.style.flexDirection = "column";
            holder_element.style.justifyContent = "center";
            holder_element.style.aligntItems = "center";
            holder_element.style.textAlign = "center";
    
            var attach_element = document.getElementById(params.attach);
            attach_element.appendChild(holder_element);

            var bar_element = document.createElement("DIV");
            bar_element.setAttribute("id",params.id+"_bar");
            bar_element.style.width = "60%"; 
            bar_element.style.height = "100%";
            bar_element.style.backgroundColor = params.color;
            bar_element.style.position = "absolute";
            holder_element.appendChild(bar_element);

            if(params.show_text === true){
                var text_element = document.createElement("P");
                text_element.innerHTML = "0";
                text_element.setAttribute("id",params.id+"_bar_txt");
                text_element.style.color = params.text_color;
                text_element.style.textAlign = "center";
                text_element.style.fontWeight = "bold";
                text_element.style.fontSize = params.font_size.toString() + "px";
                text_element.style.zIndex = 1;
                holder_element.appendChild(text_element);
            };

        };

        if(typeof(params.current) !== "undefined" && typeof(params.max) !== "undefined")
        {
            var target_element = document.getElementById(params.id + "_bar");
            var percentage = params.current / params.max;
            percentage = Math.floor(percentage * 100);
                
            if(percentage < 0){ percentage = 0 };
            target_element.style.width = percentage+"%";

            if(params.show_text === true){
                document.getElementById(params.id + "_bar_txt").innerHTML = `${params.current}/${params.max}`;
            };
        };

    };
};

f.cooldown = function(params)
{
    var el = document.getElementById(params.id);
    var cd_percent = 100 * (params.current / params.max);
    var cd_pos = 100 - cd_percent;

    if(cd_percent > -1)
    {
        el.style.height = cd_percent.toString() + "%";
        el.style.top = cd_pos.toString() + "%";
    };
        
};


return f;}());var SYS_Utils = (function(){var f = {};

f.copyArray = function(target_array){
    //THIS FUNCTION DOES NOT MUTATE/AFFECT THE TARGET ARRAY
    //AND CREATE A NEW INSTANCE OF NEW ARRAY
    var new_array = [];
    
    new_array = target_array.map(function(target_data){
       if(typeof(target_data) !== 'object'){
           return target_data;
       }else if(typeof(target_data) === 'object'){
           var new_target_array = [];
           try{ new_target_array = f.copy_array(target_data);  }catch(e){return target_data;};
           return new_target_array;
       };
    });
    return new_array;
};

f.copyObject = function(target_object){
    if(typeof(target_object) === "string"){
        //In case the target object used JSON.stringify
        return JSON.parse(target_object);
    }else {
        return JSON.parse(JSON.stringify(target_object));
    }
};

f.combineArray = function(target,value){
    var new_array = [];
    target.map(function(target){new_array.push(target); });
    value.map(function(target){new_array.push(target); });
    return new_array;
};

f.removeDataFromArray = function(target,array){
    var newarray = [];
    var i = 0;
    for(;i < array.length;i++){
        if(array[i] !== target){newarray.push(array[i]);};
    };
    return newarray;
};
f.removeDataFromArray_UsingIndex = function(id,array){
    var newarray = [];
    var i = 0;
    for(;i < array.length;i++){
        if(i !== id){newarray.push(array[i]);};
    };
    return newarray;
};

f.combineText = function(textarray){
    var combinetext = "";
    var i = 0;
    for(; i < textarray.length; i++){
        combinetext = combinetext.concat(textarray[i]);
    };
    return combinetext;
};

f.concatList = function(array,mode,seperator){
    var concat_txt = "";
    var i = 0;
    for(;i < array.length;i++){
        switch(mode){
            case "seperate":
                concat_txt = concat_txt.concat(array[i] + seperator);
            break;
            case "normal":
                concat_txt = concat_txt.concat(array[i]);
            break;
            default:
                concat_txt = concat_txt.concat(array[i]);
            break;
        };
        
    };
    return concat_txt;
};
f.rng = function(min,max){
        var max2 = max + 1;
        var rng_value = Math.floor(Math.random() * Math.floor(max2));
        if(rng_value < min){rng_value = min;};
        return rng_value;
};

f.numberToString = function(value){
    if(value >= 0){
        var txt1 = value.toString();
        var txt2 = "+";
        var txt3 = txt2.concat(txt1);
        return txt3;
    }else if(value < 0){
        var txt4 = value.toString();
        return txt4;
    };
};

f.idGenerator = function(id_length){
        var all_characters =
        ["0","1","2","3","4","5","6","7","8","9",
        "Q","W","E","R","T","Y","U","I","O","P","A","S","D","F","G","H","J","K","L","Z","X","C","V","B","N","M",
        "q","w","e","r","t","y","u","i","o","p","a","s","d","f","g","h","j","k","l","z","x","c","v","b","n","m"];
        var full_id = "";
        var randnumber = 0;
        while(id_length > 0){
           id_length--;
           randnumber = f.rng(1,all_characters.length);
           full_id = full_id.concat(all_characters[randnumber-1]);
        };
        return full_id;
    };
    
f.generateNumber = function(raw_number){
            
        var thenumber_string = "EMPTY";
        var thenumber = raw_number.toString();
    
        if(raw_number < 10){
            thenumber_string = "000" + thenumber;
        }else if(raw_number >= 10 &&  raw_number <= 99 ){
            thenumber_string = "00" + thenumber;
        }else if(raw_number >= 100 &&  raw_number <= 999 ){
            thenumber_string = "0" + thenumber;
        }else if(raw_number >= 1000 ){
            thenumber_string = thenumber;
        };
            
        return thenumber_string;
};

f.generateName = function(name_length){
    var the_name = [];
    var prev_char = "";
    var prev2_char = "";
    var chars = ["QWERTYUIOPASDFGHJKLZXCVBNMAIEOUAEIOU","qwertyuiopasdfghjklzxcvbnm","qwrtypsdfghjklzxcvbnm","aeiuo"];
    
    the_name.push(chars[0][f.rng(0,chars[0].length - 1)]);

    while(the_name.length < name_length){
 
        if(the_name.length > f.rng(4,7) && the_name.indexOf(" ") === -1){
            the_name.push(" ");
            the_name.push(chars[0][f.rng(0,chars[0].length - 1)]);
        }else{
            the_name.push(chars[1][f.rng(0,chars[1].length - 1)]);
        };

        prev_char = the_name[the_name.length - 1];
        prev2_char = the_name[the_name.length - 2];
        prev_char = prev_char.toLowerCase();
        prev2_char = prev2_char.toLowerCase();

        if(chars[2].indexOf(prev_char) >= 0 && chars[2].indexOf(prev2_char) >= 0){
            the_name.push(chars[3][f.rng(0,chars[3].length - 1)]);
        };
    };

    return f.combineText(the_name);
};

f.getDate = function(){
    
    var today = new Date();
    var dd = String(today.getDate()).padStart(2,'0');
    var mm = String(today.getMonth() + 1).padStart(2,'0');
    var yyyy = today.getFullYear();
        
    var file_date = [mm,dd,yyyy];
    
    return file_date;
};

f.convertTile = function(tile,mode){
    switch(mode){
        case "axis":
            var axis = {  
                top_left:{x:-34,y:15}, top_center:{x:0,y:15}, top_right:{x:34,y:15},
                bottom_left:{x:-34,y:-15}, bottom_center:{x:0,y:-15}, bottom_right:{x:34,y:-15},
            };
            return axis[tile];
        case "pos":
            var pos = {   
                top_left:0, top_center:1, top_right:2,    
                bottom_left:0, bottom_center:1, bottom_right:2  };
            return pos[tile];
        case "tile":
            var tile_array = tile.split("_");
            return tile_array[1];
        default: return null;
    };
};
   
return f;}());var UNIT_Armor = (function(){var f ={};

f.start_OnApplyDamage = function(bd,params){

    if(params.activator_unit.idname === "armor" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_03;},
            setup:{ instances:1, duration:10, wait_activation:3, wait_end:2 },
            sfx:{  image:"sfx_armor_ability", size:{w:30,h:45}, anim_speed:0.5},
            target_units:[ {ytile:"same",xtile:"same"} ],
            location:{ytile:"same",xtile:"same"},
            effects:[
                {type:"stats", targets:["source"], condition:[[["source_unit","power",1]],"<=",[500]], mode:"add", stat:"power", amount:[["source_unit","power",0.35]]},
                {type:"stats", targets:["source"], condition:[[["source_unit","agility",1]],"<=",[350]], mode:"add", stat:"agility", amount:[["source_unit","agility",0.35]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};


f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "armor" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_01;},
            setup:{ speed:4, detection_distance:5 },
            sfx:{  image:"sfx_armor_attack", size:{w:35,h:35}, anim_speed:0.5, rotation:45},
            locations:[{ytile:"opposite",xtile:"same"}],
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Axe = (function(){var f ={};

f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "axe" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_01;},
            setup:{ speed:4, detection_distance:5 },
            sfx:{  image:"sfx_axe_attack", size:{w:20,h:40}, anim_speed:0.5},
            locations:[{ytile:"opposite",xtile:"same"}],
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1],["target_unit","health_current",0.50]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Barrel = (function(){var f ={};

f.start_OnDeath = function(bd,params){

    if(params.activator_unit.idname === "barrel" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_03;},
            setup:{ instances:1, duration:7, wait_activation:4, wait_end:1 },
            sfx:{  image:"sfx_barrel_ability", size:{w:100,h:100}, anim_speed:0.5},
            target_units:[ {ytile:"same",xtile:"opposite"}, {ytile:"opposite",xtile:"same"}, {ytile:"opposite",xtile:"opposite"} ],
            location:{ytile:"center",xtile:"center"},
            effects:[
                {type:"status", targets:["enemy"], mode:"add", status:{idname:"poison",duration:1000}},
                {type:"status", targets:["owner"], mode:"add", status:{idname:"poison",duration:1000}},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Book = (function(){var f ={};

f.start_OnAddStatus = function(bd,params){

    if(params.activator_unit.idname === "book"){
        //We need to use the source unit because the ability effect
        //will add stats to source unit and not the activator unit
        params.source_unit = params.activator_unit;

        if(typeof(params.source_unit.data_storage.book_upgrade) === "undefined"){
            params.source_unit.data_storage.book_upgrade = 0;
        };

        if(params.source_unit.data_storage.book_upgrade < 7){
            params.source_unit.data_storage.book_upgrade += 1;

                params.action_configs = {
                    func:()=>{return ACTION_Module_03;},
                    setup:{ instances:1, duration:10, wait_activation:3, wait_end:2 },
                    sfx:{  image:"sfx_book_ability", size:{w:45,h:45}, anim_speed:2},
                    target_units:[ {ytile:"same",xtile:"same"} ],
                    location:{ytile:"same",xtile:"same"},
                    effects:[
                        {type:"stats", targets:["source"], mode:"add", stat:"power", amount:[100]},
                        {type:"stats", targets:["source"], mode:"add", stat:"vigor", amount:[100]},
                    ]
                };
            
                bd = MECHANIC_Actions.start(bd,params);
        };
    };

    return bd;
};


f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "book" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_01;},
            setup:{ speed:4, detection_distance:5 },
            sfx:{  image:"sfx_book_attack", size:{w:35,h:35}, anim_speed:0.5, rotation:45},
            locations:[{ytile:"opposite",xtile:"same"}],
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Bow = (function(){var f ={};

f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "bow" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_01;},
            setup:{ speed:4, detection_distance:5 },
            sfx:{  image:"sfx_bow_attack", size:{w:40,h:20}, anim_speed:0.5},
            locations:[{ytile:"opposite",xtile:"same"}],
            effects:[
                {type:"damage", targets:["enemy"], modifier:"pure", amount:[["source_unit","power",1]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Clam = (function(){var f ={};

f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "clam" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_03;},
            setup:{ instances:1, duration:19, wait_activation:9, wait_end:5 },
            sfx:{  image:"sfx_clam_attack", size:{w:95,h:45}, anim_speed:0.5 },
            target_units:[ {ytile:"opposite",xtile:"left"},{ytile:"opposite",xtile:"right"} ],
            location:{ytile:"opposite",xtile:"center"},
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
                {type:"status", targets:["enemy"], mode:"add", status:{idname:"slow",duration:50}},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Dagger = (function(){var f ={};


f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "dagger" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_01;},
            setup:{ speed:4, detection_distance:5 },
            sfx:{  image:"sfx_dagger_attack", size:{w:40,h:20}, anim_speed:0.5},
            locations:[{ytile:"opposite",xtile:"same"}],
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
                {type:"status", targets:["enemy"], mode:"add", status:{idname:"poison",duration:10}},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Gatling_Gun = (function(){var f ={};

f.start_OnTimeCount = function(bd,params){

    if(params.activator_unit.idname === "gatlinggun"){
        params.source_unit = params.activator_unit;
        params.action_configs = {
            func:()=>{return ACTION_Module_03;},
            setup:{ instances:1, duration:2, wait_activation:1, wait_end:1 },
            sfx:{  image:"sfx_gatlinggun_attack", size:{w:0,h:0}, anim_speed:0},
            target_units:[ {ytile:"same",xtile:"same"} ],
            location:{ytile:"same",xtile:"same"},
            effects:[
                {type:"stats", targets:["source"], mode:"add", stat:"agility", amount:[30]},
                {type:"stats", targets:["source"], mode:"reduce", stat:"health_max", amount:[10]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "gatlinggun" && params.activator_unit.id === params.source_unit.id){

        var n1 = ENGINE_Utils.rng(0,10);
        var n2 = ENGINE_Utils.rng(0,10);


        params.action_configs = {
            func:()=>{return ACTION_Module_01;},
            setup:{ speed:3, detection_distance:10 },
            sfx:{  image:"sfx_gatlinggun_attack", size:{w:20,h:10}, anim_speed:1},
            locations:[{ytile:"opposite",xtile:"same",xaxis:n1 - n2}],
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Gloves = (function(){var f ={};

f.start_OnApplyDamage = function(bd,params){

    if(params.activator_unit.idname === "gloves" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_03;},
            setup:{ instances:1, duration:2, wait_activation:1, wait_end:2 },
            sfx:{  image:"sfx_gloves_attack", size:{w:0,h:0}, anim_speed:2},
            target_units:[ {ytile:"same",xtile:"same"} ],
            location:{ytile:"same",xtile:"same"},
            effects:[
                {type:"stats", targets:["source"], condition:[[["source_unit","vigor",1]],"<=",[4000]], mode:"add", stat:"vigor", amount:[params.damage * 10]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};


f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "gloves" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_03;},
            setup:{ instances:1, duration:5, wait_activation:2, wait_end:2 },
            sfx:{  image:"sfx_gloves_attack", size:{w:45,h:45}, anim_speed:0.5},
            target_units:[ {ytile:"opposite",xtile:"same"} ],
            location:{ytile:"opposite",xtile:"same"},
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Jetpack = (function(){var f ={};

f.start_OnSpawn = function(bd,params){

    if(params.activator_unit.idname === "jetpack" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_02;},
            setup:{ speed:4, detection_distance:5 },
            sfx:{  image:"sfx_jetpack_ability", size:{w:30,h:30}, anim_speed:0.5},
            locations:[{ytile:"same",xtile:"same"}, {ytile:"same",xtile:"same"}, {ytile:"same",xtile:"opposite"}],
            effects:[
                {type:"stats", targets:["owner"], mode:"add", stat:"agility", amount:[["target_unit","agility",1.5]]},
                {type:"stats", targets:["owner"], mode:"reduce", stat:"power", amount:[["target_unit","power",0.5]]},
                {type:"stats", targets:["owner"], mode:"reduce", stat:"health_max", amount:[["target_unit","health_max",0.5]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "jetpack" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_01;},
            setup:{ speed:4, detection_distance:5 },
            sfx:{  image:"sfx_jetpack_attack", size:{w:30,h:30}, anim_speed:0.5},
            locations:[{ytile:"opposite",xtile:"same"}],
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Mask = (function(){var f ={};

f.start_OnApplyDamage = function(bd,params){

    if(params.activator_unit.idname === "mask"){

        if(typeof(params.activator_unit.data_storage.mask_units) === "undefined"){
            params.activator_unit.data_storage.mask_units = [];
        };

        var target_health = Math.round(params.source_unit.stats.health_max / 2);

        if(params.source_unit.stats.health_current <= target_health && 
            params.activator_unit.data_storage.mask_units.indexOf(params.source_unit.id) <= -1
        ){

            params.activator_unit.data_storage.mask_units.push(params.source_unit.id);

            //We need to use the source unit because the ability effect
            //will add stats to source unit and not the activator unit  
            params.source_unit = params.activator_unit;

            params.action_configs = {
                func:()=>{return ACTION_Module_03;},
                setup:{ instances:1, duration:8, wait_activation:4, wait_end:2 },
                sfx:{  image:"sfx_mask_ability", size:{w:10,h:5}, anim_speed:0.5, change_size:{w:10,h:5}},
                target_units:[ {ytile:"same",xtile:"same"} ],
                location:{ytile:"same",xtile:"same"},
                effects:[
                    {type:"stats", targets:["source"], mode:"add", stat:"power", amount:[100]},
                ]
            };
        
            bd = MECHANIC_Actions.start(bd,params);
        };
    };

    return bd;
};


f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "mask" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_03;},
            setup:{ instances:1, duration:12, wait_activation:5, wait_end:2 },
            sfx:{  image:"sfx_mask_attack", size:{w:40,h:40}, anim_speed:0.5},
            target_units:[ {ytile:"opposite",xtile:"same"} ],
            location:{ytile:"opposite",xtile:"same"},
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Necklace = (function(){var f ={};

f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "necklace" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_03;},
            setup:{ instances:1, duration:20, wait_activation:5, wait_end:10 },
            sfx:{  image:"sfx_necklace_attack", size:{w:45,h:45}, anim_speed:2},
            target_units:[ {ytile:"opposite",xtile:"same"} ],
            location:{ytile:"opposite",xtile:"same"},
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
                {type:"stats", targets:["source"], mode:"add", stat:"health_current", amount:[["target_unit","health_max",0.05]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Net = (function(){var f ={};


f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "net" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_01;},
            setup:{ speed:4, detection_distance:5 },
            sfx:{  image:"sfx_net_attack", size:{w:40,h:30}, anim_speed:0.5, rotation:45},
            locations:[{ytile:"opposite",xtile:"same"},{ytile:"opposite",xtile:"opposite"}],
            effects:[
                {type:"damage", targets:["source"], modifier:"pure", amount:[["source_unit","health_max",1]]},
                {type:"status", targets:["enemy"], mode:"add", status:{idname:"disarm",duration:1000}},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Shield = (function(){var f ={};

f.start_OnSpawn = function(bd,params){

    if(params.activator_unit.idname === "shield" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_03;},
            setup:{ instances:1, duration:2, wait_activation:1, wait_end:2 },
            sfx:{  image:"sfx_shield_attack", size:{w:0,h:0}, anim_speed:2},
            target_units:[ {ytile:"same",xtile:"same"} ],
            location:{ytile:"same",xtile:"same"},
            effects:[
                {type:"status", targets:["source"], mode:"add", status:{idname:"invulrenable",duration:100}},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};


f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "shield" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_03;},
            setup:{ instances:1, duration:10, wait_activation:5, wait_end:5 },
            sfx:{  image:"sfx_shield_attack", size:{w:35,h:35}, anim_speed:0.5, rotation:45},
            target_units:[ {ytile:"opposite",xtile:"same"} ],
            location:{ytile:"opposite",xtile:"same"},
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Slingshot = (function(){var f ={};

f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "slingshot" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_01;},
            setup:{ speed:4, detection_distance:5 },
            sfx:{  image:"sfx_slingshot_attack", size:{w:30,h:30}, anim_speed:0.5, rotation:45},
            locations:[{ytile:"opposite",xtile:"same"}],
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
                {type:"stats", targets:["source"], condition:[[["source_unit","agility",1]],">=",[50]], mode:"reduce", stat:"agility", amount:[["source_unit","agility",0.40]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Staff = (function(){var f ={};

f.start_OnAttack = function(bd,params){

    if(params.activator_unit.idname === "staff" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_01;},
            setup:{ speed:4, detection_distance:5 },
            sfx:{  image:"sfx_staff_attack", size:{w:40,h:20}, anim_speed:0.5},
            locations:[{ytile:"opposite",xtile:"same"}],
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
                {type:"stats", targets:["source"], condition:[[["source_unit","power",1]],"<=",[1200]], mode:"add", stat:"power", amount:[100]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Tesla_Coil = (function(){var f ={};

f.start_OnAttack = function(bd,params){

    var loc_pos = [{ytile:"same",xtile:"same"}, {ytile:"same",xtile:"opposite"}, {ytile:"opposite",xtile:"same"}, {ytile:"opposite",xtile:"opposite"} ];

    var loc_list = [ 
        [ loc_pos[0],loc_pos[2],loc_pos[3],loc_pos[1] ],
        [ loc_pos[0],loc_pos[2],loc_pos[3],loc_pos[2] ],
        [ loc_pos[0],loc_pos[2],loc_pos[1],loc_pos[2] ],
        [ loc_pos[0],loc_pos[2],loc_pos[1],loc_pos[3] ],
        [ loc_pos[0],loc_pos[3],loc_pos[2],loc_pos[3] ],
        [ loc_pos[0],loc_pos[3],loc_pos[2],loc_pos[1] ],
        [ loc_pos[0],loc_pos[3],loc_pos[1],loc_pos[3] ],
        [ loc_pos[0],loc_pos[3],loc_pos[1],loc_pos[2] ],
        [ loc_pos[0],loc_pos[1],loc_pos[2],loc_pos[1] ],
        [ loc_pos[0],loc_pos[1],loc_pos[2],loc_pos[3] ],
        [ loc_pos[0],loc_pos[1],loc_pos[3],loc_pos[1] ],
        [ loc_pos[0],loc_pos[1],loc_pos[3],loc_pos[2] ],
    ];

    if(params.activator_unit.idname === "teslacoil" && params.activator_unit.id === params.source_unit.id){
        params.action_configs = {
            func:()=>{return ACTION_Module_02;},
            setup:{ speed:4, detection_distance:5 },
            sfx:{  image:"sfx_teslacoil_attack", size:{w:50,h:20}, anim_speed:2},
            locations:loc_list[ENGINE_Utils.rng(0,loc_list.length - 1)],
            effects:[
                {type:"damage", targets:["enemy"], modifier:"normal", amount:[["source_unit","power",1]]},
                {type:"stats", targets:["owner"], mode:"add", stat:"health_current", amount:[["source_unit","power",0.50]]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var UNIT_Torch = (function(){var f ={};

f.start_OnAttack = function(bd,params){

    if(params.source_unit.owner_tag !== params.activator_unit.owner_tag){

        params.action_configs = {
            func:()=>{return ACTION_Module_03;},
            setup:{ instances:3, duration:7, wait_activation:2, wait_end:1 },
            sfx:{  image:"sfx_torch_attack", size:{w:40,h:45}, anim_speed:1},
            target_units:[ {ytile:"same",xtile:"same"} ],
            location:{ytile:"same",xtile:"same"},
            effects:[
                {type:"damage", targets:["source"], modifier:"normal", amount:[params.activator_unit.stats.power]},
            ]
        };
    
        bd = MECHANIC_Actions.start(bd,params);
    };

    return bd;
};

return f;}());var SC_BATTLE = (function(){var f ={};

var update_count = 0;
var update_run = false;

f.initialize = function(){
    SYS_UI.clear({id:SYS_UI.body});
    
    SI_BATTLE.initialize();
    SC_BATTLE_Render.initialize();

    //Start the update
    update_run = true;
    window.requestAnimationFrame(updateTimer);
};

function updateTimer(){
    if(update_run === true){
        window.requestAnimationFrame(updateTimer);
        update_count += 1;
        if(update_count >= SYS_Data.game.battle_update_time ){
            update_count  = 0;
            update();
        };
    };
};

function update(){
    if(SYS_Data.battle.config.battle_was_paused === false){
        //Detect if BATTLE is currently ON
        if(document.getElementById("battle_main") === null){ f.endUpdate(); };

        //Update the SYS_Data.battle
        SYS_Data.battle = ENGINE_Core.run(SYS_Data.battle);

        //Below the core of the update
        if(SYS_Data.battle != null && Object.keys(SYS_Data.battle).length > 0){
            //Detect first if the battle is over
            if(SYS_Data.battle.config.battle_is_over == true){
                SC_BATTLE.endUpdate(); 
            };
            
            SC_BATTLE_Render.update(SYS_Data.battle); 
            SC_BATTLE_Controls.update(SYS_Data.battle);
        };
    };
};

f.endUpdate = function(){
   update_run = false;

    SYS_UI.create([{
        type:"div", 
        id:"battle_transition_end", 
        attach:SYS_UI.body,
        style:{
            width:document.getElementById(SYS_UI.body).style.width,
            height: document.getElementById(SYS_UI.body).style.height,
            position:"absolute",
            backgroundColor:"rgba(0,0,0,0)",
            zIndex:9999} //zIndex 1 is for player health bar text so we set it to 2
    }]);
    
    var transition_count = 0.01;
    var transition_timer = setInterval(function(){
        transition_count += 0.01;
        SYS_UI.style([{
            id:"battle_transition_end",
            backgroundColor:`rgba(0,0,0,${transition_count})`,
        }]);
        if(transition_count >= 1){
            clearInterval(transition_timer);
            SC_RESULT.initialize(SYS_Data.battle);
        };
    },50);
    
};

return f;}());var SI_BATTLE = (function(){var f ={};

f.initialize = function(){
    createLayout(SYS_UI.body);
    createLayout_Arena("battle_main_arena");
    createLayout_UserInfo("battle_main_userinfo");

    //Create User Info
    SI_BATTLE_UserInfo.createUserInfo_Left(`battle_userinfo_left_div`);
    SI_BATTLE_UserInfo.createUserInfo_Center(`battle_userinfo_center_div`);
    SI_BATTLE_UserInfo.createUserInfo_Right(`battle_userinfo_right_div`);

    //Create Unit Info
    SI_BATTLE_Arena.unitinfo_count = -1;
    SI_BATTLE_Arena.createUnitInfo(`battle_body_unitinfo_top_holder`,"top");
    SI_BATTLE_Arena.createUnitInfo(`battle_body_unitinfo_bottom_holder`,"bottom");

    //Create Battle Zone
    SI_BATTLE_Arena.createCanvas("battle_arena_canvas_holder");
    SI_BATTLE_Arena.createIndicator(`battle_arena_indicator_holder`);
    SI_BATTLE_Arena.createStatus(`battle_arena_status_holder`);

    //Create components for controller
    SI_BATTLE_Controls.createUnits("battle_main_controls");
    SI_BATTLE_Controls.createOptions("battle_main_controls");
    
};

function createLayout(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);
    v.main = {w:v.holder_w, h:v.holder_h};
    if(v.main.h > v.main.w * 1.777 ){ v.main.h = v.main.w * 1.777; }
    if(v.main.w > v.main.h * 0.5625 ){ v.main.w = v.main.h * 0.5625; };

    v.arena = (((v.main.w / 2) * 0.90) * 2) + v.main.h * 0.22;
    v.controls = ((v.main.w / 3) * 0.90);
    v.battleinfo = (v.main.h - (v.arena + v.controls));

    SYS_UI.create([{
        type:"div", 
        id:"battle_main", 
        attach:div_holder,
        style:{
            width: v.main.w.toString() + "px",
            height: v.main.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"battle_main_userinfo", 
        attach:"battle_main",
        style:{
            width: v.main.w.toString() + "px",
            height: v.battleinfo.toString() + "px",
            marginTop:"1%",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center",
            background:`url( ${ SYS_DTL.getImage("background_white_type1") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",
            backgroundPosition:"center"}
    },{
        type:"div", 
        id:"battle_main_arena", 
        attach:"battle_main",
        style:{
            width: v.main.w.toString() + "px",
            height: v.arena.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"battle_main_controls", 
        attach:"battle_main",
        style:{
            width: v.main.w.toString() + "px",
            height: v.controls.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center"}
    }]);
};

function createLayout_UserInfo(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.userinfo_holder = {w: v.holder_w * 0.90, h:v.holder_h * 0.85};
    v.left = {w:v.userinfo_holder.w * 0.25, h:v.userinfo_holder.h * 0.80};
    v.center = {w:v.userinfo_holder.w * 0.45, h:v.userinfo_holder.h * 0.80};
    v.right = {w:v.userinfo_holder.w * 0.25, h:v.userinfo_holder.h * 0.80};

    SYS_UI.create([{
        type:"div", 
        id:"battle_userinfo_holder", 
        attach:div_holder,
        style:{
            width: v.userinfo_holder.w.toString() + "px",
            height: v.userinfo_holder.h.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"space-around",
            alignItems:"center",
            flexWrap:"wrap"}
    },{
        type:"div", 
        id:`battle_userinfo_left_div`, 
        attach:"battle_userinfo_holder", 
        style:{
             width: v.left.w.toString() + "px",
             height: v.left.h.toString() + "px",
             display:"flex",
             flexDirection:"column",
             justifyContent:"center",
             alignItems:"center"}
    },{
        type:"div", 
        id:`battle_userinfo_center_div`, 
        attach:"battle_userinfo_holder", 
        style:{
             width: v.center.w.toString() + "px",
             height: v.center.h.toString() + "px",
             display:"flex",
             flexDirection:"column",
             justifyContent:"center",
             alignItems:"center"}
    },{
        type:"div", 
        id:`battle_userinfo_right_div`, 
        attach:"battle_userinfo_holder", 
        style:{
            width: v.right.w.toString() + "px",
            height: v.right.h.toString() + "px",
            display:"flex",
            flexDirection:"column",
            justifyContent:"center",
            alignItems:"center"}
    }]);
};

function createLayout_Arena(div_holder){
    var v = {};
    v.holder_w = parseInt(document.getElementById(div_holder).style.width);
    v.holder_h = parseInt(document.getElementById(div_holder).style.height);

    v.arena = {w:((v.holder_w / 2) * 0.90) * 2, h:((v.holder_w / 2) * 0.80) * 2};
    v.playerinfo = ((v.holder_h - v.arena.h) / 2) * 0.98;
    

    SYS_UI.create([{
        type:"div", 
        id:"battle_body_unitinfo_top_holder", 
        attach:div_holder,
        style:{
            width: v.arena.w.toString() + "px",
            height: v.playerinfo.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center"}
    },{
        type:"div", 
        id:"battle_body_arena_holder", 
        attach:div_holder,
        style:{
            position:"relative",
            width: v.arena.w.toString() + "px",
            height: v.arena.h.toString() + "px",
            background:`url( ${ SYS_DTL.getImage("background_white_type5") })`,
            backgroundSize: "100% 100%",
            backgroundRepeat:"no-repeat",}
    },{
        type:"div", 
        id:"battle_arena_canvas_holder", 
        attach:"battle_body_arena_holder",
        style:{
            position:"absolute",
            width: v.arena.w.toString() + "px",
            height: v.arena.h.toString() + "px"}
    },{
        type:"div", 
        id:"battle_arena_status_holder", 
        attach:"battle_body_arena_holder",
        style:{
            zIndex:"5",
            width: v.arena.w.toString() + "px",
            height: v.arena.h.toString() + "px",
            position:"absolute",
            display:"flex",
            flexDirection:"row",
            justifyContent:"space-around",
            alignItems:"center",
            flexWrap:"wrap"}
    },{
        type:"div", 
        id:"battle_arena_indicator_holder", 
        attach:"battle_body_arena_holder",
        style:{
            zIndex:"10",
            width: v.arena.w.toString() + "px",
            height: v.arena.h.toString() + "px",
            position:"absolute",
            display:"flex",
            flexDirection:"row",
            justifyContent:"space-around",
            alignItems:"center",
            flexWrap:"wrap"}
    },{
        type:"div", 
        id:"battle_body_unitinfo_bottom_holder", 
        attach:div_holder,
        style:{
            width: v.arena.w.toString() + "px",
            height: v.playerinfo.toString() + "px",
            display:"flex",
            flexDirection:"row",
            justifyContent:"center",
            alignItems:"center"}
    }]);
    
};

return f;}());/*This comment was created to prevent the white square from popping up and causing error.*/ 

import { createPixelClickHandler } from "./createPixelClickHandler"
import { connect } from "./connection"
import { signedFetch } from '@decentraland/SignedFetch'
import { getUserData } from '@decentraland/Identity'

type MuralParams = {
    position: Vector3,
    rotation: Quaternion,
    mural: number,
    server_url_http: string
    server_url_ws: string
}

/**
 * 
 *  A Mural Creator function
 * 
 * @param mural_params - Dictionary with position, rotation, mural (id) and server_url
 * @returns Null
 * @public
 */
export function CreateMural (mural_params: MuralParams) {

    var connect_interval = 0
    var lastPaint = 0
    var receivedSyncId = 0
    var currentSyncId = -1
    var connected = false
    var selected_color = {r:0, g:0, b:0, a:0}
    var balance = -1
    var last_message = ""

    var paint_queue: Array<any> = []

    var muralroom: any;


    //-----------------------------------------------------------------------------------------------------
    //main entity
    const main = new Entity()
    main.addComponent(new Transform({
        position: mural_params.position,
        rotation: mural_params.rotation,
    }))
    engine.addEntity(main)

    const modArea = new Entity()
    modArea.addComponent(new AvatarModifierArea({
        area: { box: new Vector3(6, 4, 2) },
        modifiers: [AvatarModifiers.DISABLE_PASSPORTS, AvatarModifiers.HIDE_AVATARS],
    }))
    //modArea.addComponent(new BoxShape()) // Debug
    modArea.addComponent(new Transform({
        position: new Vector3(0, 0, -1),
        scale: new Vector3(6, 4, 2),
    }))
    modArea.setParent(main)

    //-----------------------------------------------------------------------------------------------------
    //fix_rotation entity
    // uvs can't be used, rotation must be used instead
    const fix_rotation = new Entity()
    fix_rotation.addComponent(new Transform({
        rotation: Quaternion.Euler(180, 0, 0),
    }))
    fix_rotation.setParent(main)

    //-----------------------------------------------------------------------------------------------------
    //mural entity
    const mural = new Entity()
    const mural_plane = new PlaneShape()
    // Can't use uvs, it makes the object invisible to raycast
    /*mural_plane.uvs = [
        0, 0,
        1, 0,
        1, 1,
        0, 1,
        
        0, 0,
        1, 0,
        1, 1,
        0, 1,
    ]
    mural_plane.isPointerBlocker = true
    mural_plane.withCollisions = true*/
    
    const mural_texture = new Texture(mural_params.server_url_http + "/image/"+mural_params.mural, {samplingMode: 0})
    const mural_material = new BasicMaterial()
    mural_material.texture = mural_texture

    mural.addComponent(mural_material)
    mural.addComponent(mural_plane)
    mural.addComponent(new Transform({
        scale: new Vector3(6, 4 ,1)
    }))
    mural.setParent(fix_rotation)

    //-----------------------------------------------------------------------------------------------------
    //background entity
    const background = new Entity()
    const background_plane = new PlaneShape()
    
    const background_texture = new Texture(mural_params.server_url_http + "/background")
    const background_material = new BasicMaterial()
    background_material.texture = background_texture

    background.addComponent(background_material)
    background.addComponent(background_plane)

    background.addComponent(new Transform({
        position: new Vector3(-4, 0, 0),
        rotation: Quaternion.Euler(0,0,180), 
        scale: new Vector3(2,4,1)
    }))
    background.setParent(main)

    //-----------------------------------------------------------------------------------------------------
    //Status text entity
    const status = new Entity()
    const status_shape = new TextShape()
    status.addComponent(status_shape)
    status.addComponent(new Transform({
        position: new Vector3(-4.83, -0.1, -0.01),
    }))
    status.setParent(main)
    status_shape.hTextAlign = "left"
    status_shape.vTextAlign = "top"
    status_shape.fontSize = 2
    status_shape.color = Color3.Black()
    status_shape.value = "Connecting..."

    //-----------------------------------------------------------------------------------------------------
    //Color sample entity
    const color_sample = new Entity()
    const color_sample_shape = new PlaneShape()
    color_sample.addComponent(color_sample_shape)
    color_sample.addComponent(new Transform({
        position: new Vector3(-3.36, -1.01, -0.01),
        scale: new Vector3(0.22, 0.22, 0.22)
    }))
    color_sample.setParent(main)
    const sample_material = new Material()
    sample_material.albedoColor = new Color3(0, 0, 0)
    color_sample.addComponent(sample_material)

    //-----------------------------------------------------------------------------------------------------
    //Balance text entity
    const balance_entity = new Entity()
    const balance_shape = new TextShape()
    balance_entity.addComponent(balance_shape)
    balance_entity.addComponent(new Transform({
        position: new Vector3(-3.3, 0.45, -0.01),
    }))
    balance_entity.setParent(main)
    balance_shape.hTextAlign = "right"
    balance_shape.fontSize = 3
    balance_shape.color = Color3.Black()
    balance_shape.value = "?"

    //-----------------------------------------------------------------------------------------------------
    const IMAGE_SIZE = [128,96]; 
    const PALETTE_LIMIT = 87;
    const [WIDTH, HEIGHT] = IMAGE_SIZE; //originSize
    const originS = [WIDTH, HEIGHT];
    const ENDPOINT = mural_params.server_url_http + "/validate";


    async function connect_room() {
        const user = await getUserData();

        if (!user?.hasConnectedWeb3){
            setMessage("Connect wallet\nto paint");
            return;
        }

        connect("my_room", mural_params.server_url_ws, {address: user?.publicKey, mural: mural_params.mural}).then(async (room) => {
            muralroom = room
            connected = true

            setMessage("Connected!")
            function onClickImageCallback(coord: any){
                //log('callback function', coord)
                if (coord[1] >= PALETTE_LIMIT) {
                    room.send("pick_color", coord)
                    return
                };
                lastPaint = 0
                for (var n=0; n<paint_queue.length; n++) {
                    if (paint_queue[n].x == coord[0] && paint_queue[n].y == coord[1]) {
                        return
                    }
                }
                paint_queue.push({
                    x: coord[0],
                    y: coord[1],
                    r: selected_color.r,
                    g: selected_color.g,
                    b: selected_color.b,
                    a: selected_color.a,
                })
                //log(paint_queue)
                AddCursor(coord[0], coord[1], selected_color)
            };
            const {Dispose, AddCursor, HideCursor, SetColor} = createPixelClickHandler(mural, originS, onClickImageCallback);

            /*room.state.listen("syncId", (num: number) => {
                if (num > receivedSyncId) {
                    receivedSyncId = num
                }
            });*/

            room.state.murals.onAdd = (newmural:any, key:any) => {
                log(newmural, "has been added at", key);
                log("Key:", key, " mural:", mural_params.mural);
                if (key != ""+mural_params.mural) { return }
                log("listen to onChange for", key)
                newmural.onChange = function(changes:any) {
                    log("Mural", key, " changed:", changes);
                    changes.forEach((change:any) => {
                        log(change.field);
                        log(change.value);
                        log(change.previousValue);
                        if (change.field == "syncId") {
                            receivedSyncId = change.value;
                        }
                    })
                };
            
                // force "onChange" to be called immediatelly
                newmural.triggerAll();
            };

            room.onMessage("cursor",(message) => {
                if (!message["visible"]){
                    HideCursor()
                }
            });

            room.onMessage("color",(message) => {
                selected_color = message
                SetColor(selected_color)
                refreshPanel()
            });

            room.onMessage("balance",(message) => {
                balance = message["msg"]
                refreshPanel()
            });

            room.onMessage("msg",(message) => {
                //setMessage(message["msg"])
                last_message = message["msg"]
                refreshPanel()
            });

            room.onLeave(()=>{
                connected = false
                paint_queue = []
                setMessage("Disconnected")
                Dispose()
            });

            var is_user_valid = false;
            try {
                var response = await signedFetch(ENDPOINT, {
                    method:'POST', 
                    body:JSON.stringify({    
                        sessionId: room.sessionId,
                        address: user?.publicKey
                    }),
                    headers:{
                        "Content-Type":"application/json"
                    }
                });
        
                if (!response.text) {
                    throw new Error("Invalid response")
                }
            
                var json = await JSON.parse(response.text)
                log("json", json);
                if (json.valid) {
                    is_user_valid = true;
                }
            } catch {
                log("Error fetching URL");
            }

            if (!is_user_valid) {
                connect_interval = 60
                await room.leave()
                setMessage("Validation failed\nretrying...")
            }
            

        }).catch((err) => {
            error(err);
        }); 
    };


    function refreshPanel() {
        status_shape.value = last_message
        balance_shape.value = balance<0 ? "-" : ""+balance
        sample_material.albedoColor = new Color3(selected_color.r/255, selected_color.g/255, selected_color.b/255)
    }


    function setMessage(msg) {
        last_message = msg
        refreshPanel()
    }


    class MuralSyncSystem implements ISystem {
        lastSyncTime = 0;

        update(delta:number) {
            this.lastSyncTime += delta;
            if (this.lastSyncTime < 1+Math.random()) {
                return;
            }

            if (currentSyncId != receivedSyncId) {
                currentSyncId = receivedSyncId;
                this.lastSyncTime = 0;
                const new_texture = new Texture(
                    mural_params.server_url_http + "/image/"+mural_params.mural+"?"+currentSyncId, {samplingMode: 0}
                ) 
                mural_material.texture = new_texture
            }
        }
    }
    engine.addSystem(new MuralSyncSystem());


    class ReconnectSystem implements ISystem {
        lastConnection = 0;
        
        update(delta:number) {
            this.lastConnection += delta;
            if (this.lastConnection < connect_interval) { return }
            this.lastConnection = 0;
            if (!connected) {
                connect_interval = 10;
                connect_room();
            }
        }
    }
    engine.addSystem(new ReconnectSystem());


    class PaintSystem implements ISystem {
        
        update(delta:number) {
            lastPaint += delta;
            if (lastPaint < 2) { return }
            lastPaint = 0
            if (paint_queue.length < 1) {return}
            muralroom.send("paint", paint_queue)
            log("Send queue: ")
            log(paint_queue)
            paint_queue = []
        }
    }
    engine.addSystem(new PaintSystem());


    return {
        hideMural: () => {
            engine.removeEntity(main)
        },
        showMural: () => {
            engine.addEntity(main)
        },
    }
}
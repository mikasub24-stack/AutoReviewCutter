"""HunyuanVideo 1.5 official ComfyUI recipe, native 720p, low-VRAM weights."""
BACKEND = 'hunyuan15'
REPO = 'Comfy-Org/HunyuanVideo_1.5_repackaged'
I2V = 'hunyuanvideo1.5_720p_i2v_fp16.safetensors'
T2V = 'hunyuanvideo1.5_720p_t2v_fp16.safetensors'
QWEN = 'qwen_2.5_vl_7b_fp8_scaled.safetensors'
BYT5 = 'byt5_small_glyphxl_fp16.safetensors'
VAE = 'hunyuanvideo15_vae_fp16.safetensors'
VISION = 'sigclip_vision_patch14_384.safetensors'


def sources(need_t2v=False):
    result = [(REPO,'diffusion_models',I2V), (REPO,'text_encoders',QWEN),
              (REPO,'text_encoders',BYT5), (REPO,'vae',VAE),
              ('Comfy-Org/sigclip_vision_384','clip_vision',VISION,VISION)]
    if need_t2v: result.insert(1,(REPO,'diffusion_models',T2V))
    return result


def select_models(info, need_t2v=False):
    required=['UNETLoader','DualCLIPLoader','VAELoader','CLIPVisionLoader','CLIPVisionEncode',
              'HunyuanVideo15ImageToVideo','EmptyHunyuanVideo15Latent','ModelSamplingSD3',
              'CLIPTextEncode','KSampler','VAEDecodeTiled','SaveImage','LoadImage']
    missing=[node for node in required if node not in info]
    if missing: raise RuntimeError('ComfyUI thiếu node Hunyuan 1.5: '+', '.join(missing))
    fields=[('UNETLoader','unet_name',I2V,'unet_name'),
            ('DualCLIPLoader','clip_name1',QWEN,'clip_name1'),
            ('DualCLIPLoader','clip_name2',BYT5,'clip_name2'),
            ('VAELoader','vae_name',VAE,'vae_name'),
            ('CLIPVisionLoader','clip_name',VISION,'vision_name')]
    if need_t2v: fields.append(('UNETLoader','unet_name',T2V,'t2v_name'))
    result={}
    for node,field,name,key in fields:
        choices=info[node]['input']['required'][field][0]
        value=next((x for x in choices if x.replace('\\','/').split('/')[-1]==name),None)
        if not value: raise RuntimeError('Thiếu model Hunyuan: '+name+'. Bấm Cài & tải model để tải phần còn thiếu.')
        result[key]=value
    return result


def graph(scene, models, reference=None, identity=None, prefix='HunyuanLocal', steps=50, width=1280, height=720, frames=121):
    def node(kind,**inputs):return {'class_type':kind,'inputs':inputs}
    if not reference and not models.get('t2v_name'):
        raise RuntimeError('Chưa có ảnh nhân vật và model T2V Hunyuan. Dùng Cài & tải model để chuẩn bị ảnh đầu tự động.')
    flow={
        'unet':node('UNETLoader',unet_name=models['unet_name'] if reference else models['t2v_name'],weight_dtype='fp8_e4m3fn'),
        'clip':node('DualCLIPLoader',clip_name1=models['clip_name1'],clip_name2=models['clip_name2'],type='hunyuan_video_15',device='default'),
        'vae':node('VAELoader',vae_name=models['vae_name']),
        'positive':node('CLIPTextEncode',clip=['clip',0],text=scene['prompt']),
        'negative':node('CLIPTextEncode',clip=['clip',0],text=''),
        'sampling':node('ModelSamplingSD3',model=['unet',0],shift=7.0 if reference else 9.0),
        # Full temporal context: never reset a causal VAE every 12 frames.
        'decode':node('VAEDecodeTiled',samples=['sampler',0],vae=['vae',0],tile_size=512,overlap=64,
                      temporal_size=4096,temporal_overlap=8),
        'save':node('SaveImage',images=['decode',0],filename_prefix=prefix),
    }
    if reference:
        flow['reference']=node('LoadImage',image=reference)
        flow['vision_loader']=node('CLIPVisionLoader',clip_name=models['vision_name'])
        vision_image=['reference',0]
        if identity:
            flow['identity']=node('LoadImage',image=identity);vision_image=['identity',0]
        flow['vision']=node('CLIPVisionEncode',clip_vision=['vision_loader',0],image=vision_image,crop='center')
        flow['condition']=node('HunyuanVideo15ImageToVideo',positive=['positive',0],negative=['negative',0],
                               vae=['vae',0],width=width,height=height,length=frames,batch_size=1,
                               start_image=['reference',0],clip_vision_output=['vision',0])
        positive,negative,latent=['condition',0],['condition',1],['condition',2]
    else:
        flow['latent']=node('EmptyHunyuanVideo15Latent',width=width,height=height,length=frames,batch_size=1)
        positive,negative,latent=['positive',0],['negative',0],['latent',0]
    flow['sampler']=node('KSampler',model=['sampling',0],positive=positive,negative=negative,latent_image=latent,
                         seed=scene['seed'],steps=steps,cfg=6.0,sampler_name='euler',scheduler='simple',denoise=1.0)
    return flow
